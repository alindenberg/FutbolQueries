var casper = require('casper').create({
    logLevel: "debug"
});

// Create arrays to hold urls that will be parsed
var leagueUrls = ["http://www.espnfc.us/english-premier-league/23/index", 
                "http://www.espnfc.us/spanish-primera-division/15/index", 
                "http://www.espnfc.us/german-bundesliga/10/index", 
                "http://www.espnfc.us/italian-serie-a/12/index", 
                "http://www.espnfc.us/french-ligue-1/9/index", 
                "http://www.espnfc.us/major-league-soccer/19/index"];
var teamUrls = [];

// Create arrays to hold the strings that will be formatted tuples for insertion into the respective table
var goalieTuples = [];
var outfielderTuples = [];
var playerTuples = [];

function getLeagueUrls() {
    var urls = [];
    $("div.leagues div.feature a.column-content").each(function() {
        urls.push($(this).attr("href"));
        console.log($(this).attr("href"));
    });
    return urls;
}

function getTeamUrls() {
    var urls = [];
    $("li[data-section='clubs'] ul li a").each(function() {
        urls.push($(this).attr("href"));
    });
    return urls;
}

function getSeasons() {
    var seasons = [];
    $("div#squad-seasons-dropdown select option").each(function() {
        seasons.push($(this).val());
    });
    return seasons;
}

function parseGoalies(attributes, year, team) {
    var saves = attributes[7];
    var goalsConceded = attributes[8];
    var fName = attributes[2];
    var lName = attributes[3];
    var year = year;
    var goalieTuple = 'INSERT INTO GOALIES VALUES ('
        +saves+','
        +goalsConceded+','
        +fName+','
        +lName+','
        +year+');';
    var playerTuple = parseGoaliePlayer(attributes, year, team);
    return [goalieTuple, playerTuple];
}
function parseGoaliePlayer(attributes, year, team) {
    var starts = attributes[5];
    var subIns = attributes[6];
    var age = attributes[4];
    var foulsCommitted = attributes[9];
    var yellowCards = attributes[11];
    var redCards = attributes[12];
    var foulsAgainst = attributes[10];
    var isGoalie = 'TRUE';
    var currTeam = team;
    var fName = attributes[2];
    var lName = attributes[3];
    var year = year;
    var tuple = 'INSERT INTO PLAYERS VALUES ('
        +fName+','
        +lName+','
        +year+','
        +starts+','
        +subIns+','
        +age+','
        +foulsCommitted+','
        +yellowCards+','
        +redCards+','
        +foulsAgainst+','
        +isGoalie+','
        +currTeam+');';
    return tuple;
}

function parseOutfielders(attributes, year, team) {
    var goals = attributes[7]
    var shotsOnGoal = attributes[9];
    var shots = attributes[8];
    var assists = attributes[10];
    var position = attributes[0];
    var fName = attributes[2];
    var lName = attributes[3];
    var year = year;
    var outfielderTuple = 'INSERT INTO OUTFIELDERS VALUES ('
        +goals+','
        +shots+','
        +shotsOnGoal+','
        +assists+','
        +position+','
        +fName+','
        +lName+','
        +year+');'; 
    var playerTuple = parseOutfielderPlayer(attributes, year, team); 
    return [outfielderTuple, playerTuple];
}

function parseOutfielderPlayer(attributes, year, team) {
    var starts = attributes[5];
    var subIns = attributes[6];
    var age = attributes[4];
    var foulsCommitted = attributes[11];
    var yellowCards = attributes[13];
    var redCards = attributes[14];
    var foulsAgainst = attributes[12];
    var isGoalie = 'FALSE';
    var currTeam = team;
    var fName = attributes[2];
    var lName = attributes[3];
    var year = year;
    var tuple = 'INSERT INTO PLAYERS VALUES ('
        +fName+','
        +lName+','
        +year+','
        +starts+','
        +subIns+','
        +age+','
        +foulsCommitted+','
        +yellowCards+','
        +redCards+','
        +foulsAgainst+','
        +isGoalie+','
        +currTeam+');';
    return tuple;
}

// Get league urls
// casper.start('http://www.espnfc.us/', function() {
//     leagueUrls = this.evaluate(getLeagueUrls);
// }); 

// Get team urls
casper.start().each(leagueUrls, function(self, url, i) {
    self.thenOpen(url, function() {
        teamUrls = teamUrls.concat(this.evaluate(getTeamUrls));
    });
});

casper.then(function() {
    this.echo("-- Found " + teamUrls.length + " team urls");
    this.each(teamUrls, function(self, url, i) {
        url = url.substr(0, url.length - 5) + "squad";
        var seasons = [];
        self.thenOpen(url, function() {
            seasons = this.evaluate(getSeasons);
        });
        self.then(function() {
            self.echo("-- Found " + seasons.length + " seasons");
            self.each(seasons, function(self, season, i) {
                var seasonUrl = url + "?season=" + season;
                self.thenOpen(seasonUrl, function() {
                    var team = this.getElementInfo('.squad-title h1').text;
                    var year = this.getElementInfo('#squad-seasons-dropdown span').text.substring(0,4);
                    this.echo("-- Scraping " + team + " " + year);
                    if(this.exists('.responsive-table-content')) {
                        var dataTables = this.getElementsInfo('.responsive-table-content tr');
                        for(i = 0; i < (dataTables.length); i++) {
                            var unparsedString = dataTables[i].text;
                            var parsedString = [];
                            for(j = 0; j < unparsedString.length; j++) {
                                var character = unparsedString.charAt(j);
                                if(character != '\t' && character != '\n' && character != ' ') {
                                    var str = '';
                                    while(character != '\t' && character != '\n' && character != ' ') {
                                        str += character;
                                        j++;
                                        character = unparsedString.charAt(j);
                                    }
                                    if(str == "--")
                                        str = 0;
                                    // Check for the rare case of a player not having a last name. Add an empty string if that's the case
                                    if(parsedString.length == 3 && !isNaN(str)) {
                                       parsedString.push('');
                                    }
                                    // Check that the player has 3 different names we will replace the middle name with the true last name
                                    if(parsedString.length == 4 && isNaN(str))
                                        parsedString.pop();
                                    parsedString.push(str);
                                }
                            }
                            if(parsedString[0] == 'G') {
                                var goalieQueries = parseGoalies(parsedString, year, team);
                                // Break the results into two strings: one for GOALIES table insertion and one for PLAYER table insertion
                                var goalieTable = goalieQueries[0];
                                var playerTable = goalieQueries[1];
                                goalieTuples.push(goalieTable);
                                playerTuples.push(playerTable);
                            } 
                            else if(parsedString[0] == 'M' || parsedString[0] == 'F' || parsedString[0] == 'D') {
                                var outfieldQueries = parseOutfielders(parsedString, year, team);
                                // Break the results into two strings: one for OUTFIELDERS table insertion and one for PLAYER table insertion
                                var outfielderTable = outfieldQueries[0];
                                var playerTable = outfieldQueries[1];
                                outfielderTuples.push(outfielderTable);
                                playerTuples.push(playerTable);           
                            }
                        }
                    }
                    else {
                        casper.echo("-- No data found for "+team+" "+year);
                    }
                });
            });
        });
    });
});

casper.then(function() {
    this.echo('-- *******GOALIE TUPLES*******')
    for(i = 0; i < goalieTuples.length; i++) 
        this.echo(goalieTuples[i]);
    this.echo('\n-- *******OUTFIELDERS TUPLES*******')
    for(i = 0; i < outfielderTuples.length; i++) 
        this.echo(outfielderTuples[i]);
    this.echo('\n-- *******PLAYER TUPLES*******')
    for(i = 0; i < playerTuples.length; i++) 
        this.echo(playerTuples[i]);
});

casper.run();