import * as http from 'http';

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://localhost:9090';

http.get(`${PROMETHEUS_URL}/api/v1/alerts`, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      const firing = parsed.data.alerts.filter((a: any) => a.state === 'firing');
      console.log(JSON.stringify(firing, null, 2));
    } catch (e) {
      console.error('Failed to parse alerts response', e);
    }
  });
}).on('error', (err) => {
  console.error('Error fetching alerts:', err.message);
});
