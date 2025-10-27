// Importing required modules
const express = require('express');
const axios = require('axios');
const qs = require('querystring');
const fs = require('fs');
const path = require('path');
const { limiter, errHandler } = require('./middleware');

//setting up required configurations
const app = express();
const PORT = process.env.PORT || 3198;
const LASTFM_KEY = "f0f089f28dcb2d93e37bb1aec0d84d0f";
const CACHE_DIR = process.env.CACHE_DIR || path.join(__dirname, 'cache');
const API_BASE = 'https://ws.audioscrobbler.com/2.0/?method=artist.search&format=json';

//use middleware
app.use(express.json());
app.use(limiter);

//check for the presence of API key in the environment
if (!LASTFM_KEY) {
  console.error('The LASTFM API KEY is missing.');
  process.exit(1);
}

// API endpoint for artist search
app.get('/search', async (req, res) => {
  try {
    const artistName = (req.query.artist || '').trim();
    if (!artistName) {
      return res.status(400).json({ error: 'artist query parameter is required' });
    }

    // Ensure that the CSV cache directory exists
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    // tidy the file name (safe lowercase version of artist and remove any unnnoticed space at edges)
    const safeName = artistName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const csvPath = path.join(CACHE_DIR, `${safeName}.csv`);

    // logic for the creation of CSV for cahing data which involves various steps
    // First Step is to Check if CSV already exists in the cache
    if (fs.existsSync(csvPath)) {
      console.log(`Cache was found: Reading ${csvPath}`);
      const csvData = fs.readFileSync(csvPath, 'utf8');
      const lines = csvData.trim().split('\n');
      const headers = lines[0].split(',');
      const items = lines.slice(1).map(line => {
        const cols = line.split(',');
        const obj = {};
        headers.forEach((h, i) => (obj[h] = cols[i]));
        return obj;
      });
      return res.json({ source: 'csv', count: items.length, items });
    }

    //Next, If CSV doesn’t exist → fetch from Last.fm API using the endpoint
    console.log(`📡 Fetching data from Last.fm API for artist: ${artistName}`);
    const params = {
      artist: artistName,
      api_key: LASTFM_KEY,
      format: 'json',
    };
    const lastfmURL = `${API_BASE}&${qs.stringify(params)}`;
    const response = await axios.get(lastfmURL);

    const rawArtists = response.data?.results?.artistmatches?.artist || [];
    const artists = Array.isArray(rawArtists) ? rawArtists : [rawArtists];

    // Preparing a simplified array of all artist data that were found to be similar to the artist in the query
    const items = artists.map(a => ({
      name: a.name || '',
      listeners: a.listeners || '',
      mbid: a.mbid || '',
      url: a.url || '',
    }));

    // This next function Saves the results from the endpoint to CSV for future requests
    if (items.length > 0) {
      const headers = Object.keys(items[0]).join(',');
      const rows = items.map(obj => Object.values(obj).join(','));
      const csvContent = [headers, ...rows].join('\n');
      fs.writeFileSync(csvPath, csvContent, 'utf8');
      console.log(`Cached results saved in CSV to ${csvPath}`);
    }

    // Finishing Step inolves returning of the fetched data
    return res.json({ source: 'lastfm', count: items.length, items });

  } catch (err) {
    console.error('Search error:', err.message || err);
    app.use(errHandler);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Artist search backend running on http://localhost:${PORT}`);
});
