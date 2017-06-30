'use strict'
var canvas = null

var audioCtx = null
var microphoneNode = null
var gainNode = null
var processorNode = null
var strobe = null
var tracker = null

var glCtx = null

var curTone = null

function lin2db(x) {
  return 10*Math.log10(x)
}

function db2lin(x) {
  return Math.pow(10, 0.1*x)
}


window.onload = function() {
  canvas = document.getElementById('strobe')

  var strobeActive = document.getElementById('strobe-active')

  var pitch = document.getElementById('strobe-pitch')
  var gain = document.getElementById('strobe-gain')
  var gainVal = document.getElementById('strobe-gain-val')
  var bright = document.getElementById('strobe-bright')
  var brightVal = document.getElementById('strobe-bright-val')
  var contrast = document.getElementById('strobe-contrast')
  var contrastVal = document.getElementById('strobe-contrast-val')
  var autoGain = document.getElementById('strobe-agc')

  var downOctave = document.getElementById('strobe-down-octave')
  var downSemi = document.getElementById('strobe-down-semitone')
  var toneName = document.getElementById('strobe-name')
  var upSemi = document.getElementById('strobe-up-semitone')
  var upOctave = document.getElementById('strobe-up-octave')

  var toneFreq = document.getElementById('strobe-tone')
  var cents = document.getElementById('strobe-cents')
  var centsVal = document.getElementById('strobe-cents-val')

  var trackerActive = document.getElementById('tracker-active')
  var trackerVal = document.getElementById('tracker-val')
  var trackerThreshold = document.getElementById('tracker-threshold')
  var trackerThresholdVal = document.getElementById('tracker-threshold-val')

  glCtx = canvas.getContext('webgl')

  audioCtx = new AudioContext()
  microphoneNode = null
  gainNode = audioCtx.createGain()
  processorNode = audioCtx.createScriptProcessor(512)
  strobe = new StrobeTuner(glCtx)
  tracker = new Tracker(audioCtx.sampleRate)

  trackerThreshold.value = tracker.threshold
  trackerThresholdVal.textContent = tracker.threshold

  processorNode.addEventListener('audioprocess', function(e) {
    if (strobeActive.checked) {
      strobe.pushFromBuffer(e.inputBuffer)
    }
    if (trackerActive.checked) {
      tracker.pushFromBuffer(e.inputBuffer)
    }
  })

  var getMicrophone = function(cb) {
    navigator.mediaDevices.getUserMedia({audio: true}).
      then(function(stream) {
        microphoneNode = audioCtx.createMediaStreamSource(stream)

          if (cb !== null) {
          cb()
        }
      }).
      catch(function(err) {
        console.log('error on getting microphone: ' + err)
        // TODO log message on UI
      })
  }
  var microphoneConnected = false
  var connectMicrophone = function() {
    if (!microphoneConnected) {
      microphoneNode.connect(gainNode)
      gainNode.connect(processorNode)
      processorNode.connect(audioCtx.destination)
    }
    microphoneConnected = true
  }
  var disconnectMicrophone = function() {
    if (microphoneNode !== null) {
      microphoneNode.disconnect()
    }
    microphoneConnected = false
  }

  var runDraw = false
  var drawId = null
  var draw = function() {
    // console.log('draw loop')
    if (runDraw) {
      if (strobe !== null && strobeActive.checked) {
        strobe.drawStrobe()
      }
      if (tracker !== null && trackerActive.checked) {
        var maybeFrequency = tracker.calculateFrequency()
        if (maybeFrequency !== null) {
          trackerVal.textContent = maybeFrequency.toFixed()
        }
        // tracker.flush()
      }
      drawId = window.requestAnimationFrame(draw)
    }
  }

  var hasDrawFrameAdded = false
  var startDrawloop = function() {
    runDraw = true
    if (drawId === null) {
      drawId = window.requestAnimationFrame(draw)
    }
  }

  var stopDrawloop = function() {
    runDraw = false
    if (drawId !== null) {
      window.cancelAnimationFrame(drawId)
    }
    drawId = null
  }

  strobeActive.addEventListener('change', function() {
    if (strobeActive.checked) {
      if (microphoneNode !== null) {
        connectMicrophone()
        startDrawloop()
      } else {
        getMicrophone(function() {
          connectMicrophone()
          startDrawloop()
        })
      }
    } else if(!trackerActive.checked) {
      disconnectMicrophone()
      stopDrawloop()
    }
  })
  trackerActive.addEventListener('change', function() {
    if (trackerActive.checked) {
      if (microphoneNode !== null) {
        connectMicrophone()
        startDrawloop()
      } else {
        getMicrophone(function() {
          connectMicrophone()
          startDrawloop()
        })
      }
    } else if(!strobeActive.checked) {
      disconnectMicrophone()
      stopDrawloop()
    }
  })

  curTone = new Tone(toneName.value, parseInt(pitch.value), parseInt(cents.value))

  // initialize all values based on StrobeTuner default values
  toneFreq.textContent = curTone.pitch().toFixed(4)
  strobe.baseFrequency = curTone.pitch()
  toneName.value = curTone.toString()

  gain.value = lin2db(gainNode.gain.value)
  gainVal.textContent = lin2db(gainNode.gain.value).toString()
  bright.value = strobe.brightOffset
  brightVal.textContent = strobe.brightOffset.toString()
  contrast.value = strobe.brightGain
  contrastVal.textContent = strobe.brightGain.toString()

  pitch.addEventListener('input', function() {
    var newPitch = parseInt(pitch.value)
    if (!Number.isNaN(newPitch))
      curTone.base = newPitch
  })

  gain.addEventListener('input', function() {
    gainNode.gain.value = db2lin(gain.value)
    gainVal.textContent = lin2db(gainNode.gain.value).toFixed(2)
    console.log(gainVal, gain.value, gainNode.gain.value, gainVal.textContent);
  })
  bright.addEventListener('input', function() {
    strobe.brightOffset = bright.value
    brightVal.textContent = bright.value.toString()
  })
  contrast.addEventListener('input', function() {
    strobe.brightGain = contrast.value
    contrastVal.textContent = contrast.value.toString()
  })
  autoGain.addEventListener('change', function() {
    strobe.autoGain = autoGain.checked
    gain.disabled = autoGain.checked && 'disabled'
  })

  var propagateToneChange = function() {
    toneFreq.textContent = curTone.pitch().toFixed(4)
    strobe.baseFrequency = curTone.pitch()
    toneName.value = curTone.toString()
  }
  downOctave.addEventListener('click', function() {
    curTone.lowerOctave()
    propagateToneChange()
  })
  downSemi.addEventListener('click', function() {
    curTone.lowerSemitone()
    propagateToneChange()
  })
  toneName.addEventListener('change', function() {
    var newTone = new Tone(toneName.value, parseInt(pitch.value), parseInt(cents.value))
    curTone = newTone
    propagateToneChange()
  })
  upSemi.addEventListener('click', function() {
    curTone.raiseSemitone()
    propagateToneChange()
  })
  upOctave.addEventListener('click', function() {
    curTone.raiseOctave()
    propagateToneChange()
  })

  cents.addEventListener('input', function() {
    curTone.cents = parseFloat(cents.value)
    centsVal.value = parseFloat(cents.value)
    propagateToneChange()
  })
  centsVal.addEventListener('change', function() {
    cents.value = parseFloat(centsVal.value)
    curTone.cents = parseFloat(cents.value)
    propagateToneChange()
  })

  trackerThreshold.addEventListener('input', function() {
    tracker.threshold = parseFloat(trackerThreshold.value)
    trackerThresholdVal.textContent = trackerThreshold.value
  })
}
