const resultArray = [];
const PHONEMES = true; // for testing "m", "n", "ch" ["a", "e", "i", "o", "u"];
//  ['a', 'e', 'i', 'o', 'u', 'p', 'm', 'θ', 'l', 'r', 'ch', 'b', 'n', 'd', 'k', 's', 'ñ']
const VALIDATION_ACTIVE = true;

let lastNProbabilities = {};
let numberOfStepsToAverage = 5;
let recordData = false;

// BASIC OBJECT FOR VOCAL TRACT
const constrictions = {
  getData() {
    if (this.hasAllConstrictions()) {
      const classifications = {};
      for (const type in this) {
        if (typeof this[type] == "object" && "index" in this[type]) {
          for (const subtype in this[type]) {
            classifications[`${type}.${subtype}`] = this[type][subtype];
          }
        }
      }
      return classifications;
    }
  },
  tongue: {
    index: 12.89,
    diameter: 2.43,
  },
  frontConstriction: {
    index: 43,
    diameter: 1.8,
  },
  backConstriction: {
    diameter: 1.8,
    index: 10.5,
  },
  hasAllConstrictions() {
    return Boolean(
      this.tongue && this.backConstriction && this.frontConstriction
    );
  },
};

let voiceness = 0.7;

const { send } = setupConnection(
  "phoneme",
  (message) => {
    if (message.from == "NOMBREAPP") {
      Object.assign(constrictions, message.constrictions);
      if ("voiceness" in message) {
        voiceness = message.voiceness;
      }
    }
  },
  (send) => {
    send({
      to: ["NOMBREAPP"],
      type: "message",
      command: "getConstrictions",
    });
  }
);

// SPECTRUM
/** @type {HTMLCanvasElement} */
const spectrumCanvas = document.getElementById("spectrum");
const spectrumContext = spectrumCanvas.getContext("2d");

spectrumContext.strokeStyle = "black";
/**
 * @param {number[]} spectrum
 */
function drawSpectrum(spectrum, canvas, context) {
  const { width: w, height: h } = canvas;
  context.clearRect(0, 0, w, h);
  //if (otherSpectrum) {
  //  _drawSpectrum(otherSpectrum, "blue", canvas, context);
  //}
  if (spectrum) {
    _drawSpectrum(spectrum, "black", canvas, context);
  }
}

const spectrumRange = { min: Infinity, max: -Infinity };
const updateSpectrum = (value) => {
  let didUpdateRange = false;
  if (value < spectrumRange.min) {
    spectrumRange.min = value;
    didUpdateRange = true;
  } else if (value > spectrumRange.max) {
    spectrumRange.max = value;
    didUpdateRange = true;
  }
  if (didUpdateRange) {
    spectrumRange.range = spectrumRange.max - spectrumRange.min;
  }
};
const normalizeValue = (value) => {
  return (value - spectrumRange.min) / spectrumRange.range;
};
function _drawSpectrum(spectrum, color = "black", canvas, context) {
  const { width: w, height: h } = canvas;
  const segmentLength = w / spectrum.length;
  context.strokeStyle = color;
  spectrum.forEach((value, index) => {
    const normalizedValue = normalizeValue(value);
    let height = 1 - normalizedValue;
    height *= h;
    context.beginPath();
    context.moveTo(index * segmentLength, height);
    context.lineTo((index + 1) * segmentLength, height);
    context.stroke();
  });
}

// GETTING THE DATA FROM THE MICROPHONE
let numberOfSpectrumsToAverage = 5;
const lastNSpectrums = [];
let numberOfLoudnessesToAverage = 5;
const lastNLoudnesses = [];

let loudnessThreshold = 0.02;

let _spectrum, _loudness;
let selectedClassification, selectedClassificationContainer;

const onData = ({ spectrum, loudness }) => {
  lastNSpectrums.push(spectrum);
  while (lastNSpectrums.length > numberOfSpectrumsToAverage) {
    lastNSpectrums.shift();
  }
  spectrum = spectrum.map((_, index) => {
    let sum = 0;
    lastNSpectrums.forEach((_spectrum) => {
      sum += _spectrum[index];
    });
    return sum / lastNSpectrums.length;
  });
  spectrum.forEach((value) => updateSpectrum(value));

  lastNLoudnesses.push(loudness);
  while (lastNLoudnesses.length > numberOfLoudnessesToAverage) {
    lastNLoudnesses.shift();
  }
  let loudnessSum = 0;
  lastNLoudnesses.forEach((_loudness) => (loudnessSum += _loudness));
  loudness = loudnessSum / lastNLoudnesses.length;

  drawSpectrum(spectrum, spectrumCanvas, spectrumContext);
  if (loudness > loudnessThreshold) {
    // solo clasificamos si el ruido es alto
    if (predictFlag) {
      predictThrottled(spectrum);
    }
    _spectrum = spectrum;
  } else {
    // esto manda mensajes solo cuando no predice????
    if (predictFlag) {
      const message = {
        intensity: Math.min(getInterpolation(0, 0.15, loudness), 1),
      };
      throttledSendToPinkTrombone(message);
    }
  }
  _loudness = loudness;
};

let predictFlag = false;
const predictButton = document.getElementById("predict");
predictButton.addEventListener("click", (event) => {
  predictFlag = !predictFlag;
  predictButton.innerText = predictFlag ? "stop predicting" : "predict";
});

let printButton = document.getElementById("print");
printButton.disabled = true;
printButton.addEventListener("click", (event) => {
  var data = { test: resultArray };
  var json = JSON.stringify(data);
  var blob = new Blob([json], { type: "application/json" });
  var link = document.createElement("a");
  link.href = window.URL.createObjectURL(blob);
  link.download = "datos.json";
  link.click();
  printButton.disabled = true;
  recordButton.disabled = false;
});

const recordButton = document.getElementById("record");
recordButton.addEventListener("click", (event) => {
  printButton.disabled = false;
  recordButton.disabled = true;
  recordData = true;
});

/* // esto no sirve por ahora porque no uso el local storage
function addClassification() {
  const inputs = [];
  const outputs = constrictions.getData();
  Object.assign(outputs, { voiceness });
  localStorage[classifications.length] = JSON.stringify({ inputs, outputs });
  appendClassification({ inputs, outputs });
  if (clearLocalStorageButton.disabled) {
    clearLocalStorageButton.disabled = false;
    downloadLocalstorageButton.disabled = false;
  }
}
*/

/// CLASIFICADOR de ML5
// AQUI "entrenamos" el clasificador TODO: Buscar uno mejor...
const classifier = ml5.KNNClassifier();
const trainButton = document.getElementById("train");
let shouldNormalize = false; // quizas podemos probar con esto...
trainButton.addEventListener("click", (event) => {
  if (classifications.length > 0) {
    trainButton.innerText = "training...";
    trainButton.disabled = true;
    setTimeout(() => {
      classifier.clearAllLabels();
      classifications.forEach(({ inputs, name }) => {
        inputs.forEach((input) => {
          classifier.addExample(
            shouldNormalize ? normalizeArray(input) : input,
            name
          );
        });
      });
      predictButton.disabled = false;
      trainButton.innerText = "train";
      trainButton.disabled = false;
    }, 1);
  }
});

// Aqui se obtienen los resultados y se comunica
let sortedClassifications, filteredSortedClassifications, weights, results;
let all_predictions = [];
const topPredictionSpan = document.getElementById("topPrediction");
const outputSpan = document.getElementById("OUTPUT");
const habladoSpan = document.getElementById("hablado");
async function predict(spectrum) {
  let message;
  // Clasificamos el sonido
  results = await classifier.classify(
    shouldNormalize ? normalizeArray(spectrum) : spectrum,
    phonemeLetters.length - 1
  );
  const { classIndex, label, confidencesByLabel, confidences } = results;

  // Smooth out the probabilities !!!
  phonemeLetters.forEach((foneme) => {
    lastNProbabilities[foneme].shift();
    lastNProbabilities[foneme].push(confidencesByLabel[foneme]);
    confidencesByLabel[foneme] =
      lastNProbabilities[foneme].reduce((a, b) => a + b, 0) /
      numberOfStepsToAverage;
  });
  // recompute label with smoothed out probabilities
  let avgLabel = Object.keys(confidencesByLabel).reduce((a, b) =>
    confidencesByLabel[a] > confidencesByLabel[b] ? a : b
  );
  console.log(confidencesByLabel);
  //avgLabel = label;
  sortedClassifications = classifications.toSorted(
    (a, b) => confidences[b.index] - confidences[a.index]
  );
  filteredSortedClassifications = sortedClassifications.filter(
    (classification) => confidences[classification.index] > 0
  );
  message = interpolateAllConstrictions();
  message.intensity = Math.min(getInterpolation(0, 0.15, _loudness), 1);
  results.Intensity = message.intensity;
  results.Voiceness = message.voiceness;

  /// IMPRIMIMOS LOS DATOS EN PANTALLA
  /// EN el texto de un div
  let metrics =
    "back_D: " + message["backConstriction.diameter"].toFixed(5) + "\n";
  metrics =
    metrics + "back_i: " + message["backConstriction.index"].toFixed(5) + "\n";
  metrics =
    metrics +
    "front_D: " +
    message["frontConstriction.diameter"].toFixed(5) +
    "\n";
  metrics =
    metrics +
    "front_i: " +
    message["frontConstriction.index"].toFixed(5) +
    "\n";
  metrics =
    metrics + "tongue_D: " + message["tongue.diameter"].toFixed(5) + "\n";
  metrics = metrics + "tongue_i: " + message["tongue.index"].toFixed(5) + "\n";
  metrics = metrics + "Intensity: " + message.intensity.toFixed(5) + "\n";
  metrics = metrics + "Voiceness: " + message.voiceness.toFixed(5);

  if (recordData) {
    resultArray.push({
      backD: message["backConstriction.diameter"],
      backI: message["backConstriction.index"],
      intensity: message.intensity,
      voiceness: message.voiceness,
      timesTamp: Date.now(),
      phoneme: avgLabel,
      confidences: confidencesByLabel,
    });
  }

  // Aqui cambiamos los divs
  topPredictionSpan.innerText = avgLabel; // fonema predicho
  outputSpan.innerText = metrics; // datos de las posiciones de la garganta
  if (habladoSpan.innerText.length > 30) {
    // imprimimos los ultimos fonemas predichos
    habladoSpan.innerText = habladoSpan.innerText.slice(1, 30);
  }
  habladoSpan.innerText = habladoSpan.innerText + avgLabel;

  if (message) {
    throttledSendToPinkTrombone(message);
    throttledSendToGame();
  }
  // Dibujamos el espectro
  _drawSpectrum(
    sortedClassifications[0].inputs[0],
    "green",
    spectrumCanvas,
    spectrumContext
  );
  // Guardamos las predicciones ESTO SOLO ES PARA VALIDAR COMO FUNCIONA
  if (VALIDATION_ACTIVE) {
    all_predictions.push({
      spectrum: spectrum,
      confidences: confidences,
      phonemes: classifications.map((x) => x.name),
    });
  }
}
const predictThrottled = throttle(predict, 20); //ms of prediction time

function interpolateConstrictions(a, b, interpolation) {
  interpolation = 0;
  const constriction = {};
  for (const type in a.outputs) {
    const aValue = a.outputs[type];
    const bValue = b.outputs[type];
    const value = interpolate(aValue, bValue, interpolation);
    constriction[type] = value;
  }
  return constriction;
}
function interpolateAllConstrictions() {
  const constriction = {};
  filteredSortedClassifications.forEach((classification) => {
    const weight = results.confidences[classification.index];
    for (const type in classification.outputs) {
      const value = weight * classification.outputs[type];
      if (!(type in constriction)) {
        constriction[type] = value;
      } else {
        constriction[type] += value;
      }
    }
  });
  return constriction;
}

function interpolate(from, to, interpolation) {
  return (1 - interpolation) * from + interpolation * to;
}

// COMUNICACIONES
let shouldSendToPinkTrombone = true;
let shouldSendToGame = false;
let shouldSendToLipSync = false;
let shouldSendToRobot = false;
let shouldSendToPronunciation = false;
const throttledSendToPinkTrombone = throttle((message) => {
  if (shouldSendToPinkTrombone) {
    send({ to: ["NOMBREAPP"], type: "message", ...message });
  }
}, 20);
const throttledSendToGame = throttle(() => {
  const to = [];
  if (shouldSendToGame) {
    to.push("game");
  }
  if (shouldSendToLipSync) {
    to.push("lip-sync");
  }
  if (shouldSendToRobot) {
    to.push("robot");
  }
  if (shouldSendToPronunciation) {
    to.push("pronunciation");
  }
  if (to.length > 0) {
    const _results = [];
    filteredSortedClassifications.forEach(({ name, index }) => {
      // ESTO ES INTERESANTE: AL JUEGO Y OTROS LES ENVIA LOS PESOS > 0
      _results.push({ name, weight: results.confidences[index] });
    });
    send({ to, type: "message", results: _results, loudness: _loudness });
  }
}, 5);

// ESTO ES PARA PREPARAR EL CLASSIFICADOR
let classifications = [];
function appendClassification({ inputs, outputs, name }) {
  const classification = {
    inputs,
    outputs,
    index: classifications.length,
    name,
  };
  classifications.push(classification);
  trainButton.disabled = false;
  //console.log("added classification", classification);
}

// Utility para normalizar sonido
function getMagntude(array) {
  let sum = 0;
  array.forEach((value) => {
    sum += value ** 2;
  });
  const magnitude = Math.sqrt(sum);
  return magnitude;
}
function normalizeArray(array) {
  const magnitude = getMagntude(array);
  const normalizedArray = array.map((value) => value / magnitude);
  return normalizedArray;
}

//document.body.addEventListener("click", (e) => {
//  deselect();
//});
/*
function refreshLocalstorage() {
  localStorage.clear();
  classifications.forEach((classification, index) => {
    const { inputs, outputs, name } = classification;
    classification.index = index;
    localStorage[index] = JSON.stringify({ inputs, outputs, name });
  });
}
*/

// EL BOTON PARA SUBIR CLASIFICACIONES
const uploadClassificationsInput = document.getElementById(
  "uploadClassifications"
);
uploadClassificationsInput.addEventListener("input", (event) =>
  uploadClassifications(event)
);
function uploadClassifications(event) {
  const { files } = event.target;

  const jsons = [];
  const onLoadedJSONS = () => {
    loadJSON(...jsons);
  };
  //localStorage.clear();

  const readNextFile = (index = 0) => {
    const file = files[index];
    if (file) {
      const fileReader = new FileReader();
      fileReader.onload = (event) => {
        jsons[index] = JSON.parse(event.target.result);
        readNextFile(index + 1);
      };
      fileReader.readAsText(file);
    } else {
      onLoadedJSONS();
    }
  };
  readNextFile();
}

const loadJSON = (...jsons) => {
  phonemeLetters = [];
  jsons.forEach((classifications) => {
    console.log(classifications);
    classifications.forEach((classification) => {
      if (
        // TODO ESTE IF SACAR EL true || PARA PONER SOLO ALGUNOS FONEMAS
        PHONEMES === true ||
        PHONEMES.includes(classification.name)
      ) {
        appendClassification(classification);
        lastNProbabilities[classification.name] = Array.from(
          { length: numberOfStepsToAverage },
          (_, i) => 0
        );
        phonemeLetters.push(classification.name);
        //localStorage[localStorage.length] = JSON.stringify(classification);
      }
    });
  });
};

// AHORA NO LO ESTOY USANDO PERO SE PUEDEN AGREGAR ALGUNOS EVENTOS A LAS TECLAS...
document.addEventListener("keydown", (event) => {
  if (selectedClassification && classifications.length > 1) {
    const index = classifications.indexOf(selectedClassification);
    let shouldPreventDefault = true;
    let indicesToSwap;
    switch (event.key) {
      case "ArrowDown":
        const isFirst = index == 0;
        if (!isFirst) {
          indicesToSwap = [index, index - 1];
        }
        event.preventDefault();
        break;
      case "ArrowUp":
        const isLast = index == classifications.length - 1;
        if (!isLast) {
          indicesToSwap = [index, index + 1];
        }
        event.preventDefault();
        break;
      default:
        shouldPreventDefault = false;
        break;
    }
    if (shouldPreventDefault) {
      event.preventDefault();
    }
    if (indicesToSwap) {
      const [fromIndex, toIndex] = indicesToSwap;
      [classifications[fromIndex], classifications[toIndex]] = [
        classifications[toIndex],
        classifications[fromIndex],
      ];
      const fromClassification = classifications[fromIndex];
      const toClassification = classifications[toIndex];
      fromClassification.index = fromIndex;
      toClassification.index = toIndex;
      const fromContainer = fromClassification.container;
      const toContainer = toClassification.container;
      if (fromIndex < toIndex) {
        fromContainer.parentNode.insertBefore(fromContainer, toContainer);
      } else {
        toContainer.parentNode.insertBefore(toContainer, fromContainer);
      }
      //refreshLocalstorage();
    }
  }
});

//// CONTROLADOR DEL THRESHOLD
let thresh = Array.from(document.querySelectorAll(".threshold"));
thresh.forEach((element) => {
  element.addEventListener("input", (event) => {
    const value = Number(event.target.value);
    thresh.forEach((_element) => {
      if (_element != element) {
        _element.value = value;
      }
    });
    loudnessThreshold = value;
  });
});

/// ESTO ES ONLY for validation, NOT IMPORTANT FOR PRODUCTION

// ESTO ES PARA PREPARAR LA VALIDACION

let validations = [];

const uploadValidationsInput = document.getElementById("uploadValidation");
uploadValidationsInput.addEventListener("input", (event) =>
  uploadValidations(event)
);
function uploadValidations(event) {
  const { files } = event.target;

  const jsons = [];
  const onLoadedJSONS = () => {
    organizeValidationJSONs(...jsons);
  };

  const readNextFile = (index = 0) => {
    const file = files[index];
    if (file) {
      const fileReader = new FileReader();
      fileReader.onload = (event) => {
        jsons[index] = JSON.parse(event.target.result);
        readNextFile(index + 1);
      };
      fileReader.readAsText(file);
    } else {
      onLoadedJSONS();
    }
  };
  readNextFile();
}

const organizeValidationJSONs = (...jsons) => {
  jsons.forEach((jsonFile) => {
    jsonFile.forEach((phoneme) => {
      phoneme.inputs.forEach((spectrum) => {
        const validation = {
          spectrum: spectrum,
          name: phoneme.name,
        };
        validations.push(validation);
      });
    });
  });
  validateButton.disabled = false;
};

// do the validation

let validationResults = [];

const validateButton = document.getElementById("validate");
validateButton.addEventListener("click", (event) => {
  if (validations.length > 0) {
    validateButton.innerText = "validating...";
    validateButton.disabled = true;
    validationResults = [];
    validations.forEach((validation) => {
      console.log(validation.name);
      for (let k = 2; k <= phonemeLetters.length; k++) {
        throttle(predictOffline(validation.spectrum, k, validation.name), 20);
      }
    });
    validateButton.innerText = "validate";
    validateButton.disabled = false;
  }
});

async function predictOffline(spectrum, k, phon) {
  results = await classifier.classify(
    shouldNormalize ? normalizeArray(spectrum) : spectrum,
    k
  );
  //const { classIndex, label, confidencesByLabel, confidences } = results;
  validationResults.push({
    phoneme: phon,
    k: k,
    prediction: results.confidencesByLabel,
  });
}
