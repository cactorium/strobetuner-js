
// TODO

// TODO
function Strobe(audioCtx, glCtx) {
  var me = this
  var log = function(str) {
    console.log(str)
  }

  this.buffer = new Float32Array(Strobe.BUF_SZ)
  this.bufferLen = 0
  this.sampleRate = 0
  this.offset = 0.0

  this.newData = false
  this.audioNode = audioCtx.createScriptProcessor()
  this.audioNode.onaudioprocess = function(e) {
    var buf = e.inputBuffer
    log('got data')
    log(buf)

    me.sampleRate = buf.sampleRate
    if (buf.length + me.bufferLen > me.buffer.length) {
      log('resizing buffer')
      // resize the buffer
      if (me.buffer.length > Strobe.MAX_BUF_SZ) {
        log('audio overflow!')
        return
      }

      var newLen = 2*me.buffer.length
      while (newLen < (buf.len + me.bufferLen)) {
        newLen = 2*newLen
      }
      // log(newLen)

      var newBuffer = new Float32Array(newLen)
      for (var i = 0; i < me.bufferLen; i++) {
        newBuffer[i] = me.buffer[i]
      }
      buf.copyFromChannel(
        newBuffer.subarray(me.bufferLen, me.bufferLen + buf.length),
        0)
      // log(newBuffer)

      me.buffer = newBuffer
      me.bufLen = me.bufferLen + buf.length
      me.newData = true
    } else {
      buf.copyFromChannel(
        me.buffer.subarray(me.bufferLen, me.bufferLen + buf.length),
        0)
      // log(me.buffer)
      me.bufferLen = me.bufferLen + buf.length
      me.newData = true
    }
  }
  this.flushBuffer = function() {
    this.bufferLen = 0
    this.newData = false
  }

  var draw = null

  var initOnePoly = function() {
    log('init one poly')
    draw = function() {
    }
  }

  var initManyPoly = function() {
    log('init many poly')
    draw = function() {
    }
  }

  this.drawStrobe = function() {
    if (!this.newData) {
      // log('underflow')
      return
    }

    draw()
    this.flushBuffer()
  }

  // used to set the mode
  this.useOnePoly = initOnePoly
  this.useManyPoly = initManyPoly

  // init WebGL context with the default shaders
  this.useOnePoly()
}
// about the number of values received in 1/30th of a second
Strobe.BUF_SZ = 2048
Strobe.MAX_BUF_SZ = 65536
