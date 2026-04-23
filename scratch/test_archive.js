const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
    
    await page.goto('http://localhost:5001');
    
    // Add a dummy trip so we can archive it
    await page.evaluate(() => {
        STATE.trips = [{id: 'trip123', name: 'Test Trip', country: 'France'}];
        STATE.activeTripId = 'trip123';
        saveState();
        location.reload();
    });
    
    await page.waitForTimeout(1000);
    
    // Auto-accept confirm dialog
    page.on('dialog', async dialog => {
        console.log('DIALOG MESSAGE:', dialog.message());
        await dialog.accept();
    });
    
    // Click archive button
    console.log("Clicking archive button...");
    await page.evaluate(() => {
        const btn = document.getElementById('archiveTripBtn');
        if (btn) {
            console.log("Archive button found, clicking it.");
            btn.click();
        } else {
            console.log("Archive button NOT FOUND!");
        }
    });
    
    await page.waitForTimeout(1000);
    
    // Check if archived
    const state = await page.evaluate(() => JSON.stringify({
        activeTripId: STATE.activeTripId,
        trips: STATE.trips,
        archivedTrips: STATE.archivedTrips
    }));
    
    console.log("STATE AFTER ARCHIVE:", state);
    
    await browser.close();
})();
