import https from 'https';

https.get('https://dev.portfolio-1e6.pages.dev/js/router.js', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data.includes('decodeURIComponent') ? 'FIX IS DEPLOYED' : 'FIX IS NOT DEPLOYED'));
});
