const http = require('https');

const options = {
	method: 'GET',
	hostname: 'india-mandi-price-api.p.rapidapi.com',
	port: null,
	path: '/api/mandi/prices/crop/Cabbage',
	headers: {
		'x-rapidapi-key': 'a8d902c03dmsh6ea5fd9c43c2c22p1260b8jsn6d21bc4eac7e',
		'x-rapidapi-host': 'india-mandi-price-api.p.rapidapi.com',
		'Content-Type': 'application/json'
	}
};

const req = http.request(options, function (res) {
	const chunks = [];

	res.on('data', function (chunk) {
		chunks.push(chunk);
	});

	res.on('end', function () {
		const body = Buffer.concat(chunks);
		console.log(body.toString());
	});
});

req.end();