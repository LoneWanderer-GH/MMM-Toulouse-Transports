// config is expected as follows:
/*
        {
            module: 'MMM-Toulouse-Transports',
            position: 'top_right',
            header: 'Horaires de passage',
            config: {
                apiKey: 'APIKEY',
                stopSchedules: [
                    {
                        lineNumber: 22, // shall be >0
                        stopCode: 6601, // shall be >0
                        maxEntries:2    // shall be >1
                    },
                    {
                        lineNumber: 22, // shall be a bus line identifier (L1, 51, etc.)
                        stopCode: 431,  // shall be >0
                        maxEntries:2    // shall be >1
                    }
                ],
                debug: true,
                updateInterval: 120000
            }
        }
*/

// var moment = require('moment');
const unirest = require( 'unirest' );

Module.register( "MMM-Toulouse-Transports", {
    defaults: {
        maxTimeOffset: 200, // Max time in the future for entries
        useRealtime: true,
        updateInterval: 1 * 60 * 1000, //time in ms between pulling request for new times (update request)
        animationSpeed: 2000,
        convertToWaitingTime: true, // messages received from API can be 'hh:mm' in that case convert it in the waiting time 'x mn'
        initialLoadDelay: 0, // start delay seconds.
        apiBaseSchedules: 'https://api.tisseo.fr/v1/stops_schedules.json?',
        maxLettersForDestination: 22, //will limit the length of the destination string
        concatenateArrivals: true, //if for a transport there is the same destination and several times, they will be displayed on one line
        showSecondsToNextUpdate: true, // display a countdown to the next update pull (should I wait for a refresh before going ?)
        showLastUpdateTime: false, //display the time when the last pulled occured (taste & color...)
        oldUpdateOpacity: 0.5, //when a displayed time age has reached a threshold their display turns darker (i.e. less reliable)
        oldThreshold: 0.1, //if (1+x) of the updateInterval has passed since the last refresh... then the oldUpdateOpacity is applied
        retryDelay: 5000,//10 * 1000, // delay before data update retrys (ms)
        displayRefresh: 1000, // waiting time computation frequency
        debug: false
    },

    /* Start Sequence*/
    start: function ( ) {
        Log.info("start - Starting module: " + this.name );
        Log.info("start - Send notification SET_CONFIG");
        // give config to node_helper
        this.sendSocketNotification( 'SET_CONFIG', this.config );

        // for bus schedules
        // ask to get all lines defininitions from API
        // only one call should be necessary for now
        //Log.info("start - Send notification UPDATE_GLOBAL_TISSEO_DATA");
        this.tisseodata = {
            loadingfinished : false,
            neededBusStops : [],
            neededBusLines : []
        };
        this.updateAllTisseoData();
        //this.sendSocketNotification( 'UPDATE_GLOBAL_TISSEO_DATA', null);

        this.busScheduleData = [];
        this.currentUpdateInterval = this.config.updateInterval;

        this.lastUpdate = new Date();

        this.loaded = false;
        this.updateTimer = null;


        var self = this;
        setInterval( function ( ) {
            self.updateDom( );
        }, this.config.displayRefresh);
        Log.info("start - End fo start for module: " + this.name );
    },


    getHeader: function ( ) {
        //Log.info("Start getHeader");
        var header = this.data.header;
        if (this.tisseodata.loadingfinished === true) {
            if ( this.config.showSecondsToNextUpdate ) {
                //var timeDifference = Math.round( ( this.config.updateInterval - new Date( ) + Date.parse( this.config.lastUpdate ) ) / 1000 );
                var timeDifference = Math.round( ( this.currentUpdateInterval - new Date( ) + Date.parse( this.config.lastUpdate ) ) / 1000 );

                if ( timeDifference > 0 ) {
                    header += ', next update in ' + timeDifference + 's';
                } else {
                    header += ', update requested ' + Math.abs( timeDifference ) + 's ago';
                }
            }
            if ( this.config.showLastUpdateTime ) {
                var now = this.config.lastUpdate;
                header += ( now ? ( ' @ ' + now.getHours( ) + ':' + ( now.getMinutes( ) > 9 ? '' : '0' ) + now.getMinutes( ) + ':' + ( now.getSeconds( ) > 9 ? '' : '0' ) + now.getSeconds( ) ) : '' );
            }
        }
        else {
            header += "fetching necessary lines/stops data ..."
        }

        //Log.info("End getHeader (before return statement)");
        return header;
    },

    getStyles: function () {
        //Log.info("Start getStyles");
        //Log.info("End getStyles (before return statement)");
        return ['font-awesome.css'];
    },


    getDom: function ( ) {
        Log.info("getDom - Start");
        var now = new Date(); // moment(); // moment package cannot be invoked in here ... only in nodehelper ?! not very handy
        var minutesLeft;
        var wrapper = document.createElement( "div" );
        wrapper.classList.add("small");

        if ( !this.loaded ) {
            Log.info("getDom - not loaded yet");
            wrapper.innerHTML = "Loading stop schedules ...";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        var table = document.createElement("table");
        table.className = "small";
        wrapper.appendChild(table);

        var row;
        var lineIdCell, destCell, stopNameCell, timeLeftCell;

        // cells:
        // |   icon NUmber   |               |   stopName (code)   |
        // |                 |   Direction   |   timeleft          |
        // |                 |   Direction   |   timeleft          |
        // |   icon NUmber   |               |   stopName (code)   |
        // |                 |   Direction   |   timeleft          |
        // |                 |   Direction   |   timeleft          |

        //var icon;

        Log.info("getDom - start loop over all schedule data");
        //Log.info("getDom - this.busScheduleData: "+ JSON.stringify(this.busScheduleData));
        //Log.info(this.busScheduleData);
        for ( var scheduleDataIndex = 0; scheduleDataIndex < this.busScheduleData.length; scheduleDataIndex++ ) {
            row = document.createElement("tr");

            lineIdCell = document.createElement("td");
            lineIdCell.className = "align-right bright";

            destCell = document.createElement("td");
            destCell.className = "align-right bright";

            timeLeftCell = document.createElement("td");
            timeLeftCell.className = "align-right bright";

            stopNameCell = document.createElement("td");
            stopNameCell.className = "align-right bright";

            var currentDataToDisplay = this.busScheduleData[ scheduleDataIndex ];
            var lineNumber = currentDataToDisplay.lineShortName;
            var data = currentDataToDisplay.scheduleData;
            var stopName = data.stop.name;
            var stopCode = data.stop.operatorCode;

            // put icon
            var span = document.createElement("span");
            var icon = document.createElement("i");
            icon.classList.add("fa-fw");
            icon.classList.add("fa-li", "fa", "fa-bus");
            icon.classList.add("bright");
            span.appendChild(icon);
            lineIdCell.appendChild(span);

            // put line N°
            lineIdCell.innerHTML = lineNumber;
            row.appendChild(lineIdCell);

            // put empty dest cell
            destCell.innerHTML = "";
            row.appendChild(destCell);

            // put stopname cell
            stopNameCell.innerHTML = stopName + " ("+stopCode+")";
            row.appendChild(stopNameCell);

            // create section row
            table.appendChild(row);

            // display the next scheduled times
            for(var index = 0; index < data.departure.length ; index++) {
                Log.info("getDom - start loop over a given stop schedule data ( lineNumber"+ lineNumber+")");
                row = document.createElement("tr");

                lineIdCell = document.createElement("td");
                lineIdCell.className = "align-right bright";

                destCell = document.createElement("td");
                destCell.className = "align-right bright";

                timeLeftCell = document.createElement("td");
                timeLeftCell.className = "align-right bright";

                stopNameCell = document.createElement("td");
                stopNameCell.className = "align-right bright";

                var currentElement = data.departure[index];
                // put empty icon
                span = document.createElement("span");
                icon = document.createElement("i");
                span.appendChild(icon);
                lineIdCell.appendChild(span);
                // put empty line N°
                lineIdCell.innerHTML = "";
                row.appendChild(lineIdCell);
                // put dest cell
                destCell.innerHTML = currentElement.destination[0].name;
                row.appendChild(destCell);
                // put timeleft cell
                minutesLeft = this.computeWaitingTime(now, currentElement.dateTime);
                //listElement.innerHTML += minutesLeft + " minutes";
                //uList.appendChild( listElement );
                timeLeftCell.innerHTML = minutesLeft;
                row.appendChild(timeLeftCell);
                // put row
                table.appendChild(row);
            }// end loop over all schedule times
        }// end loop over all buses numbers
        //wrapper.appendChild( uList );
        //Log.info("End getDom (before return statement)");
        return wrapper;
    },

    computeWaitingTime: function(now, string) {
        Log.info("computeWaitingTime - start - params: now: " + now + " - string: " + string);
        //var scheduledDate = moment(string);
        ////var now = moment();
        //var minutesLeft = scheduledDate.diff(now, 'minutes');
        //if(minutesLeft < 0) {
        //    Log.debug("Difference betweens moments is negative, are we trying to display a schedule time that is in the past ?");
        //    Log.debug(" Now was          : " + now.toISOString());
        //    Log.debug(" scheduledDate was: " + scheduledDate.toISOString());
        //};
        //return minutesLeft;

        // inpout string is in the form "2017-06-03 15:11"
        // now is in the form
        var endTime = string.split(' ')[1].split(':');
        //Log.info("computeWaitingTime - endTime="+endTime);

        var endDate = new Date(0, 0, 0, endTime[0], endTime[1]);
        var startDate = new Date(0, 0, 0, now.getHours(), now.getMinutes(), now.getSeconds());

        //Log.info("computeWaitingTime - startDate = "+startDate);
        //Log.info("computeWaitingTime - endDate   = "+endDate);

        var waitingTime = endDate - startDate;
        if (startDate > endDate) {
            Log.info("computeWaitingTime - startDate > endDate  !!!");

            waitingTime += 1000 * 60 * 60 * 24;
        }
        if (waitingTime > 60 * 60 * 1000) {
            // return time in hours
            waitingTime = "" + Math.ceil( ((waitingTime / 1000) / 60) / 60) + " h";
        }
        else if (waitingTime > 60 * 1000) {
            // return time in minutes
            waitingTime = "" + Math.ceil( (waitingTime / 1000) / 60) + " m";
        }
        else {
            waitingTime = "" + Math.ceil( waitingTime / 1000) + " s";
        }

        Log.info("computeWaitingTime - end - waitingTime="+waitingTime);
        return waitingTime;
    },

    socketNotificationReceived: function ( notification, payload ) {
        Log.info("socketNotificationReceived - Module received notification: " + notification);
        switch ( notification ) {
            case "JOURNEYS":
                break;
            case "BUS_SCHEDULES":
                this.busScheduleData = payload.data;
                this.lastUpdate = payload.lastUpdate;
                this.loaded = payload.loaded;
                this.currentUpdateInterval = payload.currentUpdateInterval;
                //Log.info("socketNotificationReceived - bus schedule data received is: " + this.busScheduleData);
                //Log.info("socketNotificationReceived - bus schedule data received is: " + JSON.stringify(this.busScheduleData));
                this.updateDom( );
                break;
            case "UPDATE_JOURNEYS":
                break;
            case "UPDATE_BUS_SCHEDULES":
                this.config.lastUpdate = payload.lastUpdate;
                this.updateDom( );
                break;
            case "ALL_LINES_AVAILABLE":
                this.sendSocketNotification("UPDATE_BUS_SCHEDULES");
        }
        Log.info("socketNotificationReceived - End of Module received notification: " + notification);
    },




    updateLineInfo: function(index) {
        Log.log("updateLineInfo - start");
        var self = this;
        var nextIndex = index + 1;
        var apiKey = self.config.apiKey;
        if ( index <= self.config.stopSchedules.length - 1) {
            var lineShortName = self.config.stopSchedules[index].lineNumber;
            Log.log("updateLineInfo - iteration:" + index +" get Line data for: " + lineShortName);

            var urlGetLineId = 'https://api.tisseo.fr/v1/lines.json?network=Tiss%C3%A9o&shortName='+ lineShortName +'&key=' + apiKey;

            unirest.get( urlGetLineId )
                .headers( { 'Accept': 'text/html,application/xhtml+xml,application/xml;charset=utf-8' } )
                .end( function ( response ) {
                    //Log.log("updateLineInfo - response"+ JSON.stringify(response));
                    if ( response && response.statusCode >= 200 && response.statusCode < 300 && response.body ) {
                        Log.log("updateLineInfo - REQUEST_END - the received Tisseo Lines: " + JSON.stringify(response.body));
                        if(Object.keys(response.body.lines.line).length > 0) {
                            Log.log("updateLineInfo - REQUEST_END - found the lineId=" + response.body.lines.line[0].id + " for lineNumber=" + lineShortName);
                            self.neededTisseoLines.push( {
                                lineNumber: lineShortName,
                                lineId: response.body.lines.line[0].id,
                                lineData: response.body
                            });
                            self.updateStopInfo(self.config.stopSchedules[index].stopCode, response.body.lines.line[0].id);
                        }
                        else {
                            self.log(ERROR, "updateLineInfo - REQUEST_END - Nothing found for lineNumber=" + lineShortName);

                        }
                        // do callback recursion ...
                        self.updateLineInfo(nextIndex);

                    } else {
                        if ( response ) {
                            Log.log('updateLineInfo - REQUEST_END - *** partial response received - HTTP return code ='+response.statusCode);
                            Log.log('updateLineInfo - REQUEST_END - ' + JSON.stringify(response));
                        } else {
                            Log.log('updateLineInfo - REQUEST_END - *** no response received' );
                        }
                    }
                } );
        }
        this.tisseodata.loadingfinished = true;
        Log.log("updateLineInfo - end");
    },

    updateStopInfo: function (stopCode, lineId) {
        Log.log("updateStopInfo - start - stopCode="+stopCode+" - lineId="+lineId);
        var self = this;
        var apiKey = self.config.apiKey;
        var urlAllStop = 'https://api.tisseo.fr/v1/stop_points.json?lineId=' + lineId +'&key=' + apiKey;
        unirest.get( urlAllStop )
            .headers( {'Accept': 'text/html,application/xhtml+xml,application/xml;charset=utf-8'} )
            .end( function ( response ) {
                if ( response && response.statusCode >= 200 && response.statusCode < 300 && response.body ) {
                    //Log.log("updateStopInfo - the received Tisseo stops: " + JSON.stringify(response.body));
                    for(var j = 0; j <= response.body.physicalStops.physicalStop.length - 1; j++) {
                        //Log.log("updateStopInfo - "+ JSON.stringify(response.body.physicalStops.physicalStop[j]));
                        var currentStopInfo = response.body.physicalStops.physicalStop[j];
                        var currentCode = currentStopInfo.operatorCodes[0].operatorCode.value;
                        if(currentCode == stopCode.toString() ) {
                            var stopId = currentStopInfo.id;
                            Log.log("updateStopInfo - REQUEST_END - found the stopId " + stopId + " for stopCode " + stopCode);
                            self.neededTisseoStops.push( {
                                stopCode: stopCode,
                                stopId: stopId
                            });
                            break;
                        }
                    }
                } else {
                        if ( response ) {
                            Log.log('updateStopInfo - REQUEST_END - *** partial response received - HTTP return code ='+response.statusCode);
                            Log.log('updateStopInfo - REQUEST_END - ' + JSON.stringify(response));
                        } else {
                            Log.log('updateStopInfo - REQUEST_END - *** no response received' );
                        }
                }
            } );
        Log.log("updateStopInfo - stop");
    },

    /**
     * Stores the full Tisseo Lines configuration
     */
    updateAllTisseoData : function( ) {
        Log.log("updateAllTisseoData - start");
        var self = this;
        // reset local tables
        this.tisseodata.neededBusStops = [];
        this.tisseodata.neededBusLines = [];
        // get all necessary lines Data
        Log.log("updateAllTisseoData - itreations to do: "+ self.config.stopSchedules.length);
        // start lineId and stopID search chain
        self.updateLineInfo(0);
        Log.log("updateAllTisseoData - end");
    },

} );

