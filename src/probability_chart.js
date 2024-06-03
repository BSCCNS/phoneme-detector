let f;
let margin;
let gap;
let yheight;
let WIDTH = 800,
  HEIGHT = 300;
let phonemeLetters;
let averageProb;

let font,
  fontsize = 32;

function preload() {}
function setup() {
  createCanvas(WIDTH, HEIGHT);
  margin = 60;
  phonemeLetters = [];
  gap = 0;
  yheight = HEIGHT - 2 * margin;
  let font = loadFont("/fonts/Slack-Light.ttf");
  textFont("Poppins");
  textAlign(CENTER);
}

function draw() {
  background(0x1e, 0x1e, 0x1e, 60); //255,255,255,30);
  fill(255);
  let x = margin;
  let y = margin;
  let pY = 0;
  let p = 0;
  //beginShape();
  //strokeWeight(2);
  //vertex(margin - gap / 2, margin);
  if (results) {
    if (phonemeLetters.length == 0) {
      phonemeLetters = [];
      averageProb = {};
      for (let c = 0; c < classifications.length; c++) {
        let fon = classifications[c].name;
        phonemeLetters.push(fon);
        averageProb[fon] = [0, 0, 0, 0, 0, 0];
      }

      gap = (WIDTH - 2 * margin) / classifications.length;
    }

    let c = 1;
    for (var foneme in results.confidencesByLabel) {
      p = results.confidencesByLabel[foneme];
      averageProb[foneme].shift();
      averageProb[foneme].push(p);

      pY =
        (averageProb[foneme].reduce((a, b) => a + b, 0) * yheight) /
        averageProb[foneme].length; //p*yheight+margin;
      //console.log(pY);
      stroke(0xff);
      strokeWeight(2);

      // probabilty lines
      line(
        margin + (c - 1) * gap,
        HEIGHT - margin,
        margin + (c - 1) * gap,
        HEIGHT - margin - pY
      );
      glow(255, 400);
      line(
        margin + (c - 1) * gap,
        HEIGHT - margin,
        margin + (c - 1) * gap,
        HEIGHT - margin - pY
      );
      glow(255, 80);
      line(
        margin + (c - 1) * gap,
        HEIGHT - margin,
        margin + (c - 1) * gap,
        HEIGHT - margin - pY
      );
      glow(255, 12);
      line(
        margin + (c - 1) * gap,
        HEIGHT - margin,
        margin + (c - 1) * gap,
        HEIGHT - margin - pY
      );

      // rect(x-gap, 0, x,  pY);
      /* 
            bezierVertex(
                x-2*gap/slope, y+gap/slope, 
                x-gap/slope,  pY-gap/slope, 
                x,pY);
                */
      //line(x,y,x+gap,pY);
      x = x + gap;
      y = pY;

      stroke(60);
      strokeWeight(0.5);
      textSize(12);
      text(phonemeLetters[c - 1], margin + (c - 1) * gap, HEIGHT - margin + 12);

      line(
        margin + (c - 1) * gap,
        margin,
        margin + (c - 1) * gap,
        HEIGHT - margin
      );

      if (p > 0) {
        textSize(p * 60 * results.Intensity);
        text(
          phonemeLetters[c - 1],
          margin + (c - 1) * gap,
          margin + 80 - p * 80
        );
      }

      c++;
    }
  }
  //noFill();
  //endShape();
}

function glow(glowColor, blurriness) {
  drawingContext.shadowColor = glowColor;
  drawingContext.shadowBlur = blurriness;
}
