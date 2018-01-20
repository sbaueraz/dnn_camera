var config = require('./config');
const fs = require('fs');
const path = require('path');
const RaspiCam = require('raspicam');
const spawn = require('child_process').spawn;

var express = require('express');
var app = express();
var router = express.Router();

const child_process = require('child_process');

app.use('/js', express.static(__dirname + '/js'));
app.use('/img', express.static(__dirname + '/img'));
app.use('/css', express.static(__dirname + '/css'));
app.use(express.static(__dirname + '/public'));

app.listen(3000);

// all of our routes will be prefixed with /api
app.use('/api', router);

var scanning = false;
var matches = [];
var snapFile = config.camera.temp_dir + "/snap.jpg";
var detectedFile = config.camera.temp_dir + "/detected.png";
var tempFilePNG = config.camera.temp_dir + "/d.png";
var tempFile = config.camera.temp_dir + "/d";

console.logCopy = console.log.bind(console);

console.log = function()
{
    // Timestamp to prepend
    var timestamp = new Date().toJSON();

    if (arguments.length)
    {
        // True array copy so we can call .splice()
        var args = Array.prototype.slice.call(arguments, 0);

        // If there is a format string then... it must
        // be a string
        if (typeof arguments[0] === "string")
        {
            // Prepend timestamp to the (possibly format) string
            args[0] = "%o: " + arguments[0];

            // Insert the timestamp where it has to be
            args.splice(1, 0, timestamp);

            // Log the whole array
            this.logCopy.apply(this, args);
        }
        else
        { 
            // "Normal" log
            this.logCopy(timestamp, args);
        }
    }
};

router.get('/getMatches', function(req, res) {
    res.json(matches);
});

router.get('/getImage', function(req, res) {
    returnFile(snapFile,res);      
});

router.get('/getDetected', function(req, res) {
    returnFile(detectedFile,res);      
});

var opts = {
        mode: "photo",
        quality: config.camera.quality,
        width: config.camera.width,
        height: config.camera.height,
        output: snapFile,
        log: console.logCopy,
        rotation: config.camera.rotation,
        burst: true,
        timelapse: config.camera.timelapse,
        timeout: 999999999};

var camera = new RaspiCam(opts);

camera.start();

/*camera.on("read", function(err, timestamp, filename){ 
    if (!scanning) {
        scanning = true;


        scanning = false;
    }
});*/

//listen for the process to exit when the timeout has been reached
camera.on("exit", function(){
    console.log("Restarting camera");
    camera.start();
});

// darknet detector test voc.data tiny-yolo-voc.cfg tiny-yolo-voc.weights -out /var/tmp/detected
var detector = spawn('darknet', ['detector','test',config.detector.datacfg,config.detector.cfgfile,config.detector.weightfile,'-out',tempFile]);

detector.stdout.on('data', (data) => {
    var msg = data.toString('utf8');
    //console.log('detector stdout:', msg);
    var lines = msg.split('\n');

    for (var i = 0;i < lines.length;i ++) {

        if (lines[i].includes('Enter Image Path:')) {
            fs.rename(tempFilePNG, detectedFile, function(){});
            detector.stdin.write(snapFile+"\n");
        }
        else if (lines[i].includes('%') && lines[i].includes(':')) {
            //chair: 32%
            var detected = lines[i].split(':');
            var prediction = {};

            prediction.timestamp  = new Date();
            prediction.className  = detected[0];
            prediction.confidence = detected[1];

            matches.push(prediction);

            while (matches.length > 50)
                matches.shift();
        }
    }
});

detector.stderr.on('data', (data) => {
  console.error('detector stderr:', data.toString('utf8'));
});

function returnFile(image, res) {
    var type='image/jpeg';
    if (image.endsWith('.png'))
        type='image/png';
    fs.readFile(image, function(err, data) {
        res.writeHead(200, {'Content-Type': type});
        res.end(data); // Send the file data to the browser.
    });
}

