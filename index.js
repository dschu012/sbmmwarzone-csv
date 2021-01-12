const fetch = require("node-fetch");
const fs = require('fs');
const divisions = require("./divisions");

function getLeagueFromKD(kd) {
    if(kd < divisions[divisions.length - 1].lowerBound) {
        return divisions[divisions.length - 1];
    }
    for (const division of divisions)
        if (division.lowerBound <= kd && kd <= division.upperBound)
            return division;
    return divisions[0];
}

function player(match, matchOverview) {
    return match.data.players.find(p => {
        return p.playerMatchStat.player.username === matchOverview.username
            && p.playerMatchStat.playerStats.teamPlacement === matchOverview.position
            && p.playerMatchStat.playerStats.damageDone === matchOverview.damage
            && p.playerMatchStat.playerStats.kills === matchOverview.kills
    })
}

function team(match, player) {
    return match.data.players.filter(p => {
        return p.playerMatchStat.player.team === player.playerMatchStat.player.team
    });
}

function set_player_ranks(match) {
    const sorted = match.data.players.sort((a, b) => {
        return (b.playerStat.lifetime ? b.playerStat.lifetime.mode.br.properties.kdRatio : 0) - 
            (a.playerStat.lifetime ? a.playerStat.lifetime.mode.br.properties.kdRatio : 0);
    });
    for(let i = 0; i < sorted.length; i++) {
        sorted[i].playerMatchStat.player.rank = i+1;
    }
}

function sum(a, col) {
    return a.reduce((i, j) => (i += +j[col], i), 0);
}

const args = process.argv.slice(2);
const a = args[0].trim().match(/^https:\/\/sbmmwarzone.com\/profile\/(.*?)\/platform\/(.*?)$/);
if(a.length !== 3) {
    throw new Error(`Invalid URL Format. Format should follow https://sbmmwarzone.com/profile/USERNAME/platform/PLATFORM_NAME`);
}
const columns = [
    "Date",
    "Mode",
    "Queue",
    "Placement",
    "Kills",
    "Deaths",
    "KD",
    "Bronze",
    "Silver",
    "Gold",
    "Diamond",
    "Total",
    "Match ID"
];

let u = decodeURIComponent(a[1]);
if(u.indexOf('#') >= 0) {
    u = encodeURIComponent(u);
}

console.log(`Fetching matches for ${decodeURIComponent(u)}, platform ${a[2]}.`);
fetch(`https://app.sbmmwarzone.com/player/match?username=${u}&platform=${a[2]}`)
.then(async (response) => {
    const matches = await response.json();
    if(matches.length == 0) {
        throw new Error(`No matches found for ${decodeURIComponent(u)}, platform ${a[2]}.`);
    }
    console.log(`Found ${matches.length} matches.`);
    const fout = fs.createWriteStream(`./${matches[0].username}-${new Date().getTime()}.csv`);
    const all_match_data = [];
    fout.write(`${a[0]}\n\n`);
    fout.write(columns.join(", "));
    fout.write(`\n`);
    for(const matchOverview of matches) {
        console.log(`Downloading match ${matchOverview.id}.`);
        let response = await fetch(`https://app.sbmmwarzone.com/?matchId=${matchOverview.id}`);
        const match = await response.json();
        let d = columns.reduce((i,j) => (i[j]="",i), {});
        let p = player(match, matchOverview);
        let t = team(match, p);
        set_player_ranks(match);
        if(!p) {
            throw new Error(`Player not found in match ${matchOverview.id}.`);
        }
        let divison = getLeagueFromKD(match.matchStatData.teamMedian);
        d["Date"] = new Date(matchOverview.startedAt * 1000).toLocaleDateString();
        d["Mode"] = match.matchStatData.mode;
        d["Queue"] = t.length;
        d["Placement"] = p.playerMatchStat.playerStats.teamPlacement;
        d["Kills"] = p.playerMatchStat.playerStats.kills;
        d["Deaths"] = p.playerMatchStat.playerStats.deaths;
        d["KD"] = p.playerMatchStat.playerStats.kdRatio;
        d[divison.metal] = "1";
        d["Total"] = "1";
        d["Match ID"] = `https://sbmmwarzone.com/lobby/${match.id}/player/${p.playerMatchStat.player.username}`;
        all_match_data.push(d);
        fout.write(columns.map(k => d[k]).join(", "));
        fout.write(`\n`);
    }

    let t = all_match_data.length;
    let d = ["Bronze", "Silver", "Gold", "Diamond"]
    .map(e => { 
        let s = sum(all_match_data, e); 
        return [s, (s/t * 100)] 
    });
    fout.write(`, , , , , , , ${d.map(d => d[0]).join(", ")}, ${t}\n`);
    fout.write(`, , , , , , , ${d.map(d => d[1]).join(", ")}, \n`);
});