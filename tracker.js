'use strict'

function Tracker(sampleRate) {
  var me = this

  this.sampleRate = sampleRate

  this.buffer = new Float32Array(2*Tracker.WINDOW_SZ)
  this.bufferOffset = 0
  this.threshold = 0.3

  this.autoCorrelationBuffer = new Float32Array(Tracker.WINDOW_SZ)

  this.pushFromBuffer = function(buf) {
    var ary = buf.getChannelData(0)
    for (var i = 0; i < buf.length; i++) {
      var newVal = ary[i]
      var oldOffset = this.bufferOffset - this.autoCorrelationBuffer.length - 1
      if (oldOffset < 0) {
        oldOffset += this.buffer.length
      }
      var oldVal = this.buffer[oldOffset]

      var oldDelayIdx = oldOffset - 1
      var newDelayIdx = this.bufferOffset - 1
      if (oldDelayIdx < 0) {
        oldDelayIdx += this.buffer.length
      }
      if (newDelayIdx < 0) {
        newDelayIdx += this.buffer.length
      }


      // TODO: compare this against directly calculating the autocorrelation
      // each function call to ensure that this is correct
      for (var j = 0; j < this.autoCorrelationBuffer.length; j++) {
        // remove the old value, and then add the new one
        this.autoCorrelationBuffer[j] -= oldVal * this.buffer[oldDelayIdx]
        this.autoCorrelationBuffer[j] += newVal * this.buffer[newDelayIdx]

        oldDelayIdx--
        if (oldDelayIdx < 0) {
          oldDelayIdx += this.buffer.length
        }
        newDelayIdx--
        if (newDelayIdx < 0) {
          newDelayIdx += this.buffer.length
        }
      }

      this.buffer[this.bufferOffset] = newVal

      this.bufferOffset++
      if (this.bufferOffset >= this.buffer.length) {
        this.bufferOffset = 0
      }
    }
    /*
    var checkCorrelation = new Float32Array(this.autoCorrelationBuffer.length)
    for (var i = 0; i < this.autoCorrelationBuffer.length; i++) {
      for (var j = 0; j < this.autoCorrelationBuffer.length; j++) {
        var off = this.bufferOffset - j
        if (off < 0) {
          off += this.buffer.length
        }
        var off2 = this.bufferOffset - i - j - 1
        if (off2 < 0) {
          off2 += this.buffer.length
        }
        checkCorrelation[i] += this.buffer[off]*this.buffer[off2]
      }
    }
    */
  }

  this.calculateFrequency = function() {
    var me = this
    var normalized = this.autoCorrelationBuffer
    // find the first peak normalized value and calculate its frequency
    var peaks = []
    for (var i = normalized.length-1; i > 0; i--) {
      if (normalized[i] > normalized[i-1] && normalized[i] > normalized[i+1]) {
        if (normalized[i] > this.threshold) {
          peaks.push([i, normalized[i]])
        }
      }
    }
    if (normalized[0] > normalized[1]) {
      if (normalized[0] > this.threshold) {
        peaks.push([0, normalized[0]])
      }
    }
    console.log(peaks)
    if (peaks.length > 0) {
      return this.sampleRate / (peaks[0][0] + 1)
    } else {
      return null
    }
  }

  this.flush = function() {
    this.buffer.fill(0.0)
    this.autoCorrelationBuffer.fill(0.0)
  }
}

Tracker.WINDOW_SZ = 2048
