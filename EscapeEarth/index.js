import fetch from 'node-fetch';
import fs from 'fs';

const PLAYER_EMAIL = 'jakobno@uia.no';
const RIS_API = 'https://spacescavanger.onrender.com';
const SOLAR_API = 'https://api.le-systeme-solaire.net/rest.php/bodies';

async function startGame(player) {
    const response = await fetch(`${RIS_API}/start?player=${encodeURIComponent(player)}`);
    if (!response.ok) throw new Error(`Start failed: ${response.status}`);
    return response.json();
}

async function submitAnswer(answer, player) {
    const response = await fetch(`${RIS_API}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer, player })
    });
    if (!response.ok) throw new Error(`Submit failed: ${response.status}`);
    return response.json();
}

async function fetchSolarData() {
    const response = await fetch(SOLAR_API);
    if (!response.ok) throw new Error('Solar API failed');
    const data = await response.json();
    return data.bodies;
}

async function solveSunChallenge() {
    const bodies = await fetchSolarData();
    const sun = bodies.find(b => b.englishName === "Sun");
    return Math.abs(sun.equaRadius - sun.meanRadius).toString();
}

async function solveAxialTiltChallenge() {
    const bodies = await fetchSolarData();
    const earth = bodies.find(b => b.englishName === "Earth");
    return bodies.filter(b => b.isPlanet && b.englishName !== "Earth")
                .reduce((closest, current) => 
                    Math.abs(current.axialTilt - earth.axialTilt) <
                    Math.abs(closest.axialTilt - earth.axialTilt) ? current : closest
                ).englishName;
}

async function solveShortestDayChallenge() {
    const bodies = await fetchSolarData();
    const planets = bodies.filter(b => b.isPlanet);
    return planets.reduce((shortest, current) => {  
        const currentRotation = Math.abs(current.sideralRotation || Infinity) * 24; 
        const shortestRotation = Math.abs(shortest.sideralRotation || Infinity) * 24;
        return currentRotation < shortestRotation ? current : shortest;
    }).englishName;
}

async function solveMoonCountChallenge() {
    const bodies = await fetchSolarData();
    return bodies.find(b => b.englishName === "Jupiter").moons.length.toString();
}

async function solveLargestMoonChallenge() {
   
    const bodies = await fetchSolarData();
    const jupiter = bodies.find(b => b.englishName === "Jupiter");
    if (!jupiter || !jupiter.moons || jupiter.moons.length === 0) {
        throw new Error("Jupiter's moons data not available");
    }
    
    
    const moonDetailsPromises = jupiter.moons.map(async (moonRef) => {
        const res = await fetch(moonRef.rel);
        if (!res.ok) throw new Error(`Failed to fetch moon data for ${moonRef.moon}`);
        return res.json();
    });
    const moonDetails = await Promise.all(moonDetailsPromises);
    
    const largestMoon = moonDetails.reduce((largest, moon) => {
        return (moon.meanRadius > (largest.meanRadius || 0)) ? moon : largest;
    });
    return largestMoon.englishName;
}

async function solvePlutoClassificationChallenge() {
    
    const bodies = await fetchSolarData();
    const pluto = bodies.find(b => b.englishName === "Pluto");
    if (!pluto) throw new Error("Pluto not found");
    
    return pluto.bodyType;
}


function parseQuestion(question) {
    
    
    return { target: 'mass', operator: '>', value: 0 };
}

function convertUnits(value, from, to) {  
    return value;
}

function getBodyValue(body, target) {  
    return body[target];
}

function filterBodies(bodies, criteria) {
    return bodies.filter(b => b[criteria.target] > criteria.value);
}

async function main() {
    try {
        let state = await startGame(PLAYER_EMAIL);
        console.log('Initial state:', JSON.stringify(state, null, 2));
        
        
        while (!(state.skeletonKey || state.sceletonKey)) {
            if (state.challenge || state.nextChallenge) {
                const challenge = state.challenge || state.nextChallenge;
                console.log('\n=== CHALLENGE ===\n', challenge);
                
                let answer;
                if (challenge.includes('Sun')) {
                    answer = await solveSunChallenge();
                } else if (challenge.includes('axial tilt')) {
                    answer = await solveAxialTiltChallenge();
                } else if (challenge.includes('shortest day')) {
                    answer = await solveShortestDayChallenge();
                } else if (challenge.includes('number of moons')) {
                    answer = await solveMoonCountChallenge();
                } else if (challenge.includes('largest moon')) {
                    answer = await solveLargestMoonChallenge();
                } else if (challenge.includes('classification')) {
                    answer = await solvePlutoClassificationChallenge();
                } else {
                    throw new Error(`Unknown challenge: ${challenge}`);
                }
                
                console.log('Submitting:', answer);
                state = await submitAnswer(answer, PLAYER_EMAIL);
                console.log('Server response:', JSON.stringify(state, null, 2));
                continue;
            }

            if (state.question) {
                console.log('\n=== QUESTION ===\n', state.question);
                const criteria = parseQuestion(state.question);
                const bodies = await fetchSolarData();
                const matches = filterBodies(bodies, criteria);
                const value = getBodyValue(matches[0], criteria.target);
                const answer = criteria.target.toLowerCase().includes('velocity') 
                    ? value.toFixed(2) 
                    : value.toString();
                
                console.log('Answer:', answer);
                state = await submitAnswer(answer, PLAYER_EMAIL);
                console.log('Server response:', JSON.stringify(state, null, 2));
                continue;
            }

            throw new Error(`Unexpected server response: ${JSON.stringify(state)}`);
        }
        
        
        const finalKey = state.skeletonKey || state.sceletonKey;
        fs.writeFileSync('skeletonkey.txt', finalKey);
        console.log('\n=== SUCCESS ===\nSkeleton key saved!');

    } catch (error) {
        console.error('\n=== FAILURE ===\nReason:', error.message);
        process.exit(1);
    }
}

main();
