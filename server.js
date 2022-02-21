require('dotenv').config();
const express = require('express');

var mongoose = require("mongoose");
const { MongoClient } = require('mongodb');

const cors = require('cors');
const app = express();
const dns = require('dns');
var bodyParser = require('body-parser');

var MONGO_URI = process.env.MONGOLAB_URI;
console.log("MONGO_URI: " + MONGO_URI);
mongoose.connect(MONGO_URI);

const options = {
  family: 6,
  hints: dns.ADDRCONFIG | dns.V4MAPPED
};

// Basic Configuration
const port = process.env.PORT || 3000;


var UrlShortenerMapping = new mongoose.Schema({
  original_url: String,
  short_url: Number
});
var UrlShortenerMapping = mongoose.model("UrlShortenerMapping", UrlShortenerMapping);

app.use(cors());

app.use('/public', express.static(`${process.cwd()}/public`));
app.use('', bodyParser.urlencoded({extended: false}));

function checkIfExists(original_url) {
  return new Promise(function(resolve, reject) {
    UrlShortenerMapping.findOne({ original_url: original_url }, function(err, doc) {
      if (doc === null || err) resolve({ status: false });
      else resolve({ status: true, short_url: doc.short_url });
    });
  });
}

function shorterUrl() {
  return new Promise(function(resolve, reject) {    
    UrlShortenerMapping.find({})
      .sort({short_url:-1})
      .limit(1)
      .select({short_url : 1})
      .exec(function(err,data){
        if(err) return console.log(err);
        var ultimo = 0;
        data.forEach(function(result){
          ultimo = ultimo + result.short_url;
        });
        resolve({short_url: parseInt(ultimo+1)});
      })
  });
}          

function redirectToOriginalUrl(short_url) {
  return new Promise(function(resolve, reject) {
    console.log("redirectToOriginalUrl recibio ====> " + short_url);
    UrlShortenerMapping.findOne({ short_url: short_url }, function(err, doc) {
      if (err || doc === null) {
        console.log("err: " + err)
        return reject(err);}
      else {
        console.log("doc: " + doc.original_url)
        return resolve(doc.original_url);
      }
    });
  });
}

function saveUrlMapping(mapping) {
  console.log("Entro saveUrlMapping");
  return new Promise(function(resolve, reject) {
    mapping.save(function(err, data) {
      if (err) return reject(err);
      else {
        console.log("Respuesta save -> " + data)
        var result = { original_url: data.url, short_url: data.short_url };
        return resolve(null, data);
      }
    });
  });
}

app.post('/api/shorturl',function(req, res) {
  var url = req.body.url;
  console.log("post url: [" + url + "]");
  var validUrl = url.split('//');
  console.log("validUrl length: " + validUrl);
  if(validUrl.length != 2){
    console.log("Url invalida")
    return res.json({ error: 'invalid url' });
  }
  var dnsLookup = new Promise(function(resolve, reject) {
    var result = url.replace(/(^\w+:|^)\/\//, "");
    console.log("result: " + result)
    dns.lookup(result, function(err, addresses, family) {
      if (err) reject(err);
      resolve(addresses);
    });
  });
  
  dnsLookup
    .then(function() {
      return checkIfExists(url);
    })
    .then(function(data) {
      if (data.status) {
        console.log("Si existe: {" + data.short_url + "}");
        return res.json({ original_url: url, short_url: data.short_url });
      } else {
        var ultimo=0;
        shorterUrl().then(function(data){
          console.log("shorterUrl().then(function(data){: short_url: " + data.short_url);
          ultimo = data.short_url;
        });
        var urlMapping = new UrlShortenerMapping({
            original_url: url,
            short_url: ultimo
        });
        console.log("urlMapping: " + urlMapping);
        return saveUrlMapping(urlMapping);
      }
    })
    .then(function(urlResult) {
      //console.log('after save: ' + urlResult.short_url)
      return urlResult;
      //return res.json({ original_url: urlResult.original_url, short_url: urlResult.short_url });
      //return redirectToOriginalUrl(original_url)
    });
  dnsLookup.catch(function(reason) {
    console.log("Error: =========> " + reason);
    return res.json({ error: "invalid URL", reason : reason });
  });  
});

app.get('/api/shorturl/',function(req, res) {
    UrlShortenerMapping.find({})
      .sort({short_url:1})
      .select({_id: 0, original_url: 1, short_url:1})
      .exec(function(err,data){
        if(err) return console.log(err);
        res.json(data);
      })
});

app.get('/api/shorturl/:short_url',function(req, res) {
  var short_url = req.params.short_url;
  console.log("short_url param value:" + short_url)
  var redirectPromise = redirectToOriginalUrl(short_url);
  redirectPromise.then(function(original_url) {
    return res.redirect(original_url);
  });
  redirectPromise.catch(function(reason) {
    return res.json({ error: "invalid URL" });
  });
});

app.get('/', function(req, res) {
  var ultimo = 0;
  shorterUrl().then(function(data){
          console.log("short_url: " + data.short_url);
          ultimo = data.short_url;
        });
  console.log("ultimo: " + ultimo);
  
  
  res.sendFile(process.cwd() + '/views/index.html');
});

// Your first API endpoint
app.get('/api/hello', function(req, res) {
  res.json({ greeting: 'hello API' });
});

app.listen(port, function() {
  console.log(`Listening on port ${port}`);
});
