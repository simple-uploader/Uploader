process.env.TMPDIR = 'tmp'; // to avoid the EXDEV rename error, see http://stackoverflow.com/q/21071303/76173

var express = require('express');
var multipart = require('connect-multiparty');
var multipartMiddleware = multipart();
var uploader = require('./uploader-node.js')('tmp');
var app = express();

// Configure access control allow origin header stuff
var ACCESS_CONTROLL_ALLOW_ORIGIN = true;

// Host most stuff in the public folder
app.use(express.static(__dirname + '/public'));
app.use(express.static(__dirname + '/../../dist'));

// Handle uploads through Uploader.js
app.post('/upload', multipartMiddleware, function(req, res) {
  uploader.post(req, function(status, filename, original_filename, identifier) {
    console.log('POST', status, original_filename, identifier);
    if (ACCESS_CONTROLL_ALLOW_ORIGIN) {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Headers", "content-type")
    }
    setTimeout(function () {
      res.send(status);
    }, 500);
  });
});


app.options('/upload', function(req, res){
  console.log('OPTIONS');
  if (ACCESS_CONTROLL_ALLOW_ORIGIN) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "content-type")
  }
  res.status(200).send();
});

// Handle status checks on chunks through Uploader.js
app.get('/upload', function(req, res) {
  uploader.get(req, function(status, filename, original_filename, identifier) {
    console.log('GET', status);
    if (ACCESS_CONTROLL_ALLOW_ORIGIN) {
      res.header("Access-Control-Allow-Origin", "*");
    }

    res.status(status == 'found' ? 200 : 204).send(status);
  });
});

app.get('/download/:identifier', function(req, res) {
  uploader.write(req.params.identifier, res);
});

app.listen(3000);
