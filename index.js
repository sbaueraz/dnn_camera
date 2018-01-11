const cv = require('opencv4nodejs');
const fs = require('fs');
const path = require('path');

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

if (!cv.xmodules.dnn) {
  return console.log('exiting: opencv4nodejs compiled without dnn module');
}

// replace with path where you unzipped inception model
const inceptionModelPath = '.';

const modelFile = path.resolve(inceptionModelPath, 'tensorflow_inception_graph.pb');
const classNamesFile = path.resolve(inceptionModelPath, 'imagenet_comp_graph_label_strings.txt');
if (!fs.existsSync(modelFile) || !fs.existsSync(classNamesFile)) {
  console.log('exiting: could not find inception model');
  console.log('download the model from: https://storage.googleapis.com/download.tensorflow.org/models/inception5h.zip');
  return;
}

// read classNames and store them in an array
const classNames = fs.readFileSync(classNamesFile).toString().split("\n");

// initialize tensorflow inception model from modelFile
const net = cv.readNetFromTensorflow(modelFile);

const classifyImg = (img) => {
  // inception model works with 224 x 224 images, so we resize
  // our input images and pad the image with white pixels to
  // make the images have the same width and height
  const maxImgDim = 224;
  const white = new cv.Vec(255, 255, 255);
  const imgResized = img.resizeToMax(maxImgDim).padToSquare(white);

  // network accepts blobs as input
  const inputBlob = cv.blobFromImage(imgResized);
  net.setInput(inputBlob);

  // forward pass input through entire network, will return
  // classification result as 1xN Mat with confidences of each class
  const outputBlob = net.forward();

  // find all labels with a minimum confidence
  const minConfidence = 0.05;
  const locations =
    outputBlob
      .threshold(minConfidence, 1, cv.THRESH_BINARY)
      .convertTo(cv.CV_8U)
      .findNonZero();

  const result =
    locations.map(pt => ({
      confidence: parseInt(outputBlob.at(0, pt.x) * 100) / 100,
      className: classNames[pt.x]
    }))
      // sort result by confidence
      .sort((r0, r1) => r1.confidence - r0.confidence)
      .map(res => `${res.className} (${res.confidence})`);

  return result;
}

router.get('/getImage', function(req, res) {
    returnFile('/var/tmp/snap.jpg',res);      
});

let args = ['-w', '1024', '-h', '768', '-o', '/var/tmp/snap.jpg', '-t', '1'];
let spawn = child_process.spawn('raspistill', args);

function returnFile(image, res) {
    fs.readFile(image, function(err, data) {
        res.writeHead(200, {'Content-Type': 'image/jpeg'});
        res.end(data); // Send the file data to the browser.

        let args = ['-w', '1024', '-h', '768', '-o', '/var/tmp/snap.tmp.jpg', '-t', '1','-rot','180'];
        let spawn = child_process.spawn('raspistill', args);
        spawn.on('exit', (code) => {
            console.log("raspistill exit code:",code);
            fs.unlinkSync(image);
            fs.renameSync('/var/tmp/snap.tmp.jpg', image);
        });
    });
}

/*setInterval(function() {
//console.log("Taking photo");

    //console.log('A photo is saved with exit code, ', code);
    console.log(" ");
    testData.forEach((data) => {
        //console.log("Loading ",data.image)
        const img = cv.imread(data.image);
        //console.log('%s: ', data.label);
        const predictions = classifyImg(img);
        predictions.forEach(p => console.log(p));
        //console.log();
    });
});
},100);
*/

