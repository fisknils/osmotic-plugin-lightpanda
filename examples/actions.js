const { Osmotic } = require('osmotic');

// Only pages after render() go through Lightpanda; the rest are fetched as usual
Osmotic.plugins([require('../dist/index.cjs')({ renderAll: false })]);

new Osmotic()
	// Log in on the demo site's login form, which lets any user in, before the HTML is captured
	.render({
		actions: async (page) => {
			await page.fill('#username', 'demo');
			await page.fill('#password', 'demo');
			await page.click('input[type=submit]');
			await page.waitFor('.quote');
		},
	})
	.get('https://quotes.toscrape.com/login')
	.find('.header-box')
	.set({ links: ['a'] })
	.data((header) => console.log(header))
	.config({ maxPages: 1 })
	.run();
