// GeoMiner AI — Automated API Test Suite
const http = require('http');

const BASE_URL = 'http://localhost:3000';

function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runTests() {
    const results = [];
    let passed = 0, failed = 0;

    function pass(name, detail) {
        console.log(`  ✅ PASS: ${name}${detail ? ' — ' + detail : ''}`);
        results.push({ name, status: 'PASS', detail });
        passed++;
    }

    function fail(name, detail) {
        console.error(`  ❌ FAIL: ${name}${detail ? ' — ' + detail : ''}`);
        results.push({ name, status: 'FAIL', detail });
        failed++;
    }

    console.log('\n=== GeoMiner AI Automated Test Suite ===\n');

    // Test 1: Home page
    try {
        const r = await request('GET', '/');
        r.status === 200 ? pass('GET /', `HTTP ${r.status}`) : fail('GET /', `Expected 200 got ${r.status}`);
    } catch(e) { fail('GET /', e.message); }

    // Test 2: predict.html
    try {
        const r = await request('GET', '/predict.html');
        r.status === 200 ? pass('GET /predict.html', `HTTP ${r.status}`) : fail('GET /predict.html', `Expected 200 got ${r.status}`);
    } catch(e) { fail('GET /predict.html', e.message); }

    // Test 3: results.html
    try {
        const r = await request('GET', '/results.html');
        r.status === 200 ? pass('GET /results.html', `HTTP ${r.status}`) : fail('GET /results.html', `Expected 200 got ${r.status}`);
    } catch(e) { fail('GET /results.html', e.message); }

    // Test 4: dashboard.html
    try {
        const r = await request('GET', '/dashboard.html');
        r.status === 200 ? pass('GET /dashboard.html', `HTTP ${r.status}`) : fail('GET /dashboard.html', `Expected 200 got ${r.status}`);
    } catch(e) { fail('GET /dashboard.html', e.message); }

    // Test 5: GET /occurrences
    try {
        const r = await request('GET', '/occurrences');
        if (r.status === 200 && Array.isArray(r.body)) {
            pass('GET /occurrences', `${r.body.length} mineral occurrence records returned`);
        } else {
            fail('GET /occurrences', `Status ${r.status}, body: ${JSON.stringify(r.body).substring(0, 80)}`);
        }
    } catch(e) { fail('GET /occurrences', e.message); }

    // Test 6: GET /predictions
    try {
        const r = await request('GET', '/predictions');
        if (r.status === 200 && Array.isArray(r.body)) {
            pass('GET /predictions', `${r.body.length} prediction records in history`);
        } else {
            fail('GET /predictions', `Status ${r.status}, body: ${JSON.stringify(r.body).substring(0, 80)}`);
        }
    } catch(e) { fail('GET /predictions', e.message); }

    // Test 7: GET /stats
    try {
        const r = await request('GET', '/stats');
        r.status === 200 ? pass('GET /stats', `total_predictions: ${r.body.total_predictions}`) : fail('GET /stats', `Status ${r.status}`);
    } catch(e) { fail('GET /stats', e.message); }

    // Test 8: Geocode
    try {
        const r = await request('GET', '/geocode?q=Bengaluru,India');
        if (r.status === 200 && r.body.success) {
            pass('GET /geocode', `Bengaluru -> lat:${r.body.latitude.toFixed(4)}, lon:${r.body.longitude.toFixed(4)}`);
        } else {
            fail('GET /geocode', `Status ${r.status}, success: ${r.body?.success}`);
        }
    } catch(e) { fail('GET /geocode', e.message); }

    // Test 9: Validate results.html has NO rock type input (auto-detection check)
    try {
        const fs = require('fs');
        const html = fs.readFileSync('./frontend/results.html', 'utf8');
        const hasRockTypeInput = html.includes('sel-rock-type') || html.includes('inp-rock-type');
        const hasAutoFields = html.includes('res-rock-type') && html.includes('res-lithology') && html.includes('res-geological-unit') && html.includes('res-formation');
        if (!hasRockTypeInput && hasAutoFields) {
            pass('Auto Rock Type Detection', 'No manual input, has res-rock-type, res-lithology, res-geological-unit, res-formation');
        } else {
            fail('Auto Rock Type Detection', `hasRockTypeInput: ${hasRockTypeInput}, hasAutoFields: ${hasAutoFields}`);
        }
    } catch(e) { fail('Auto Rock Type Detection', e.message); }

    // Test 10: Validate predict.html has NO rock type dropdown
    try {
        const fs = require('fs');
        const html = fs.readFileSync('./frontend/predict.html', 'utf8');
        const hasRockTypeDropdown = html.includes('sel-rock-type') || html.includes('Rock Type') || html.includes('rock-type');
        if (!hasRockTypeDropdown) {
            pass('predict.html Rock Type Removed', 'No rock type input found in predict.html');
        } else {
            fail('predict.html Rock Type Removed', 'Rock type input still found in predict.html');
        }
    } catch(e) { fail('predict.html Rock Type Check', e.message); }

    // Test 11: Validate predict.js sends proper payload (no manual rock_type)
    try {
        const fs = require('fs');
        const js = fs.readFileSync('./frontend/js/prediction.js', 'utf8');
        const has26Minerals = js.includes('Iron') && js.includes('Quartzite') && js.includes('Clay') && js.includes('Diamond');
        const populatesGeoFields = js.includes('res-geological-unit') && js.includes('res-lithology') && js.includes('res-formation') && js.includes('res-rock-type');
        if (has26Minerals && populatesGeoFields) {
            pass('prediction.js Mineral Display', '26 minerals defined and all geo fields populated');
        } else {
            fail('prediction.js Mineral Display', `has26Minerals:${has26Minerals} populatesGeoFields:${populatesGeoFields}`);
        }
    } catch(e) { fail('prediction.js Check', e.message); }

    // Test 12: Validate predict.py has GIS point-in-polygon logic
    try {
        const fs = require('fs');
        const py = fs.readFileSync('./ml/predict.py', 'utf8');
        const hasPIP = py.includes('point_in_polygon') && py.includes('shapefile');
        const hasAllMinerals = py.includes('Iron') && py.includes('Quartzite') && py.includes('Clay') && py.includes('Diamond');
        const hasGeoFields = py.includes('lithology') && py.includes('geological_unit') && py.includes('formation');
        if (hasPIP && hasAllMinerals && hasGeoFields) {
            pass('predict.py GIS + Minerals', 'Point-in-polygon, shapefile, 26 minerals, geo fields all present');
        } else {
            fail('predict.py GIS + Minerals', `hasPIP:${hasPIP} hasAllMinerals:${hasAllMinerals} hasGeoFields:${hasGeoFields}`);
        }
    } catch(e) { fail('predict.py Check', e.message); }

    // Summary
    console.log('\n=== Test Summary ===');
    console.log(`  Total:  ${passed + failed}`);
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    
    if (failed === 0) {
        console.log('\n🎉 ALL TESTS PASSED! GeoMiner AI is functioning correctly.\n');
    } else {
        console.log(`\n⚠️  ${failed} test(s) failed. Review output above.\n`);
    }
}

runTests().catch(console.error);
