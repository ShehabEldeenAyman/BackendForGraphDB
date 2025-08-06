const express = require('express')
const axios = require('axios') //handle http request sparql queries
const cors = require ('cors') //front end requests
const crypto = require('crypto');
const { createClient } = require('redis');
const path = require('path');
const fs = require('fs');


const app = express();
app.use(cors());
app.use(express.json());

const SPARQL_ENDPOINT = 'http://localhost:7200/repositories/test-repo'; // change this

// Initialize Redis client
const redisClient = createClient();
redisClient.connect().catch(console.error);

// Helper to hash the query string to use as Redis key
function getCacheKey(query) {
    return crypto.createHash('sha256').update(query).digest('hex');
}

app.get('/', (req, res) => {
 // res.send('Node server is up and running. Waiting for your queries!');
  res.sendFile('index.html', { root: __dirname });

});

app.get('/model', (req, res) => {
  const filePath = '../RDF-Data/timeseriesmapping.ttl';  // Replace with the actual file path
  res.download(filePath, (err) => {
    if (err) {
      console.error('File download error:', err);
      res.status(500).send('Could not download the file.');
    }
  });
});

app.post('/sparql', async (req, res) => {
    const query = req.body.query;
    if (!query) {
        return res.status(400).json({ error: 'Missing SPARQL query in request body' });
    }

    const cacheKey = getCacheKey(query);

    try {

        // 1. Try getting cached result
        const cached = await redisClient.get(cacheKey);
        if (cached) {
            console.log('✅ Cache hit');
            return res.json(JSON.parse(cached));
        }

        console.log('❌ Cache miss – querying GraphDB');


        const response = await axios.get(SPARQL_ENDPOINT, {
            params: { query },
            headers: {
                Accept: 'application/sparql-results+json'
            }
        });

        await redisClient.setEx(cacheKey, 3600, JSON.stringify(response.data));


        res.json(response.data);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'SPARQL query failed' });
    }
});


app.get('/browse', (req, res) => {
  // Read the folder content
  fs.readdir(path.join(__dirname, '../RDF-Data/'), (err, files) => {
    if (err) {
      return res.status(500).send('Unable to scan directory');
    }

    // Build a simple HTML listing
    let fileList = files.map(file => {
      return `<li><a href="/files/${encodeURIComponent(file)}">${file}</a></li>`;
    }).join('');

    res.send(`
      <h1>File List</h1>
      <ul>${fileList}</ul>
    `);
  });
});


// Endpoint to download files
app.get('/files/:filename', (req, res) => {
  const filename = req.params.filename;

  // Resolve the full path safely
  const filePath = path.join(path.join(__dirname, '../RDF-Data/'), filename);

  // Check if the file exists before sending
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      return res.status(404).send('File not found');
    }

    // Send file as attachment (forces download)
    res.download(filePath, filename);
  });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Node.js backend running on port ${PORT}`);
});


