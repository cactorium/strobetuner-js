'use strict'

var log = function(str) {
  console.log(str)
}

function FifoBuffer() {
  var offset = 0
  var bufferList = null
  var last = null
  var totalLength = 0

  function BufferNode(buffer, next) {
    this.buffer = buffer
    this.next = next 
  }

  this.len = function() {
    return totalLength
  }

  this.empty = function() {
    offset = 0
    bufferList = null
    last = null
    totalLength = 0
  }

  this.push = function(ary) {
    if (bufferList === null) {
      bufferList = new BufferNode(ary, null)
      last = bufferList
    } else {
      var newNode = new BufferNode(ary, null)
      last.next = newNode
      last = newNode
    }
    totalLength = totalLength + ary.length
  }

  // O(n^2) time and memory unfortunately
  // also doesn't work when sz > totalLength
  this.pop = function(sz) {
    if (offset + sz < bufferList.buffer.length) {
      offset += sz
      totalLength -= sz

      return bufferList.buffer.subarray(offset - sz, offset)
    } else {
      var ret = new Float32Array(sz)
      var numCollected = 0

      while (numCollected < sz && bufferList !== null) {
        var numLeft = bufferList.buffer.length - offset
        for (var i = offset; i < bufferList.buffer.length && numCollected < sz; i++) {
          ret[numCollected] = bufferList.buffer[i]
          numCollected++
          numLeft--
        }

        if (numLeft === 0) {
          offset = 0
          bufferList = bufferList.next
          if (bufferList === null) {
            last = null
          }
        }
      }
      totalLength -= numCollected

      return ret
    }
  }
}

function StrobeTuner(audioCtx, glCtx) {
  var me = this
  
  // Audio related stuff
  this.buffer = new Float32Array(StrobeTuner.BUF_SZ)
  this.fifo = new FifoBuffer()
  this.sampleRate = audioCtx.sampleRate

  this.baseFrequency = 440.0
  this.sampleOffset = 0

  this.autoGain = true

  var audioCount = 0
  this.audioNode = audioCtx.createScriptProcessor(256, 1, 1)
  this.audioNode.onaudioprocess = function(e) {
    var buf = e.inputBuffer
    audioCount += buf.length
    // log('got data')

    var ary = new Float32Array(buf.length)
    buf.copyFromChannel(ary, 0)
    me.fifo.push(ary)
  }
  this.pullFromFifo = function(sz) {
    var buf = this.fifo.pop(sz)
    if (sz > this.buffer.length) {
      for (var i = 0; i < this.buffer.length; i++) {
        this.buffer[i] = buf[sz - this.buffer.length + i]
      }
    } else {
      this.buffer.copyWithin(0, sz)
      for (var i = 0; i < sz; i++) {
        this.buffer[this.buffer.length - sz + i] = buf[i]
      }
    }

    this.sampleOffset += sz
    this.sampleOffset = this.sampleOffset - Math.floor(me.sampleOffset*(me.baseFrequency/(1000*me.sampleRate)))/(me.baseFrequency/(1000*me.sampleRate))


  }

  // WebGL related stuff
  var setupShader = function(source, type) {
    var shader = glCtx.createShader(type)
    glCtx.shaderSource(shader, source)
    glCtx.compileShader(shader)
    if (!glCtx.getShaderParameter(shader, glCtx.COMPILE_STATUS)) {
      log('shader compilation error: ' + glCtx.getShaderInfoLog(shader))
      glCtx.deleteShader(shader)
      shader = null
    }

    return shader
  }
  var setupProgram = function(vShader, fShader) {
    var program = glCtx.createProgram()
    glCtx.attachShader(program, vShader)
    glCtx.attachShader(program, fShader)
    glCtx.linkProgram(program)
    if (!glCtx.getProgramParameter(program, glCtx.LINK_STATUS)) {
      log('program compilation error: ' + glCtx.getProgramInfoLog(program))
      glCtx.deleteProgram(program)
      program = null
    }

    return program
  }

  var draw = null
  var resetDraw = null
  var clearGlState = null

  this.brightGain = 100.00
  this.brightOffset = 0.00

  var initManyPoly = function() {
    var inited = false

    // set up the initial OpenGL state
    glCtx.clearColor(0.0, 0.0, 0.0, 1.0) // start off in complete darkness
    glCtx.disable(glCtx.DEPTH_TEST) // draw all polygons
    glCtx.enable(glCtx.BLEND) // turn on blending
    glCtx.blendFunc(glCtx.ONE, glCtx.ONE) // accumulate values

    var vertexSource = [
      "attribute mediump vec4 aVertexPosition;",
      "attribute mediump vec3 aStrobeCoord;",
      "",
      "varying mediump vec3 strobeCoord;",
      "",
      "void main(void) {",
      "  gl_Position = aVertexPosition;",
      "  strobeCoord = aStrobeCoord;",
      "}"
    ].join("\n")
    var fragmentSource = [
      "const lowp float numMultipliers = 8.0;",
      "",
      "uniform mediump float gain;",
      "uniform mediump float offset;",
      "",
      "varying mediump vec3 strobeCoord;",
      "",
      "void main(void) {",
      "  lowp float multiplier = 1.0 + floor(numMultipliers*strobeCoord.x);",
      "  mediump float pos = fract(multiplier*strobeCoord.y);",
      "  lowp float v = gain * strobeCoord.z;",
      "  if (pos > 0.5) {",
      "    v = offset + v;",
      "  } else {",
      "    v = offset - v;",
      "  }",
      "  gl_FragColor = vec4(v, v, v, 1.0);",
      "}"
    ].join("\n")

    log("vertex shader setup")
    var vertexShader = setupShader(vertexSource, glCtx.VERTEX_SHADER)
    log("fragment shader setup")
    var fragmentShader = setupShader(fragmentSource, glCtx.FRAGMENT_SHADER)
    if (vertexShader === null || fragmentShader === null) {
      log("shader setup failed")
      return
    }

    log("program setup")
    var program = setupProgram(vertexShader, fragmentShader)
    if (vertexShader === null || fragmentShader === null) {
      log("program setup failed")
      return
    }
    glCtx.useProgram(program)

    var vertexPosition = glCtx.getAttribLocation(program, 'aVertexPosition')
    glCtx.enableVertexAttribArray(vertexPosition)
    var vertexTexCoord = glCtx.getAttribLocation(program, 'aStrobeCoord')
    glCtx.enableVertexAttribArray(vertexTexCoord)

    var gainUniform = glCtx.getUniformLocation(program, 'gain')
    var offsetUniform = glCtx.getUniformLocation(program, 'offset')

    var vertexBuf = glCtx.createBuffer()
    var vertexCoordBuf = glCtx.createBuffer()
    var vertexIndexBuf = glCtx.createBuffer()
    inited = true
    var bufferReady = false

    var lastTime = 0
    var startTime = 0
    var lastLogTime = 0
    draw = function() {
      var now = performance.now()
      var dt = now - lastTime
      var firstRun = lastTime === 0
      lastTime = now
      // log(dt)

      if (!inited) {
        return
      }
      if (!firstRun) {
        if (!bufferReady && me.fifo.len() > StrobeTuner.MIN_FIFO_SZ) {
          bufferReady = true
        }
        if (bufferReady) {
          var numFrames = Math.floor(dt*me.sampleRate/1000)
          // log('frames ' + numFrames)
          if (me.fifo.len() < numFrames) {
            log('underflow')
            return
          }
          if (now - lastLogTime > 1000) {
            log('rate ' + 1000 * audioCount / (now-startTime))
            lastLogTime = now
          }
          me.pullFromFifo(numFrames)

          var vertexData = new Float32Array(4*(2+3)*me.buffer.length)
          var vertexIdxs = new Uint16Array(2*3*me.buffer.length)

          var scale = 1.0
          if (me.autoGain) {
            var bufMax = 0.0001
            for (var i = 0; i < me.buffer.length; i++) {
              var absVal = Math.abs(me.buffer[i])
              if (bufMax < absVal) {
                bufMax = absVal
              }
            }
          }

          for (var i = 0; i < me.buffer.length; i++) {
            var curOffset = (me.sampleOffset - me.buffer.length + i)*me.baseFrequency/me.sampleRate
            var phaseOffset = (curOffset + 0.5) - Math.floor(curOffset + 0.5)

            var val = me.buffer[i]*scale
            vertexData[(2+3)*(4*i+0) + 0] = 1.0
            vertexData[(2+3)*(4*i+0) + 1] = 2.0 + phaseOffset
            vertexData[(2+3)*(4*i+0) + 2] = 1.0
            vertexData[(2+3)*(4*i+0) + 3] = 2.0
            vertexData[(2+3)*(4*i+0) + 4] = val

            vertexData[(2+3)*(4*i+1) + 0] = 1.0
            vertexData[(2+3)*(4*i+1) + 1] = -2.0 + phaseOffset
            vertexData[(2+3)*(4*i+1) + 2] = 1.0
            vertexData[(2+3)*(4*i+1) + 3] = 0.0
            vertexData[(2+3)*(4*i+1) + 4] = val

            vertexData[(2+3)*(4*i+2) + 0] = -1.0
            vertexData[(2+3)*(4*i+2) + 1] = -2.0 + phaseOffset
            vertexData[(2+3)*(4*i+2) + 2] = 0.0
            vertexData[(2+3)*(4*i+2) + 3] = 0.0
            vertexData[(2+3)*(4*i+2) + 4] = val

            vertexData[(2+3)*(4*i+3) + 0] = -1.0
            vertexData[(2+3)*(4*i+3) + 1] = 2.0 + phaseOffset
            vertexData[(2+3)*(4*i+3) + 2] = 0.0
            vertexData[(2+3)*(4*i+3) + 3] = 2.0
            vertexData[(2+3)*(4*i+3) + 4] = val
          }
          for (var i = 0; i < me.buffer.length; i++) {
            vertexIdxs[2*3*i + 0] = 4*i + 0;
            vertexIdxs[2*3*i + 1] = 4*i + 1;
            vertexIdxs[2*3*i + 2] = 4*i + 2;
            vertexIdxs[2*3*i + 3] = 4*i + 0;
            vertexIdxs[2*3*i + 4] = 4*i + 2;
            vertexIdxs[2*3*i + 5] = 4*i + 3;
          }

          // log(me.buffer.length)
          glCtx.bindBuffer(glCtx.ARRAY_BUFFER, vertexBuf)
          glCtx.bufferData(glCtx.ARRAY_BUFFER, vertexData, glCtx.DYNAMIC_DRAW)

          glCtx.clear(glCtx.COLOR_BUFFER_BIT)

          glCtx.vertexAttribPointer(vertexPosition, 2, glCtx.FLOAT, false, 5*4, 0)
          glCtx.vertexAttribPointer(vertexTexCoord, 3, glCtx.FLOAT, false, 5*4, 2*4)

          glCtx.bindBuffer(glCtx.ELEMENT_ARRAY_BUFFER, vertexIndexBuf)
          glCtx.bufferData(glCtx.ELEMENT_ARRAY_BUFFER, vertexIdxs, glCtx.DYNAMIC_DRAW)

          glCtx.uniform1f(gainUniform, (me.brightGain/me.buffer.length))
          glCtx.uniform1f(offsetUniform, me.brightOffset/me.buffer.length)

          glCtx.drawElements(glCtx.TRIANGLES, 2*me.buffer.length, glCtx.UNSIGNED_SHORT, 0)
        }
        // glCtx.finish()
      } else {
        // flush out any old data
        me.fifo.empty()
        startTime = now
      }

    }

    resetDraw = function() {
      lastTime = 0
      bufferReady = false
    }

    clearGlState = function() {
      // TODO
    }
  }

  this.drawStrobe = function() {
    draw()
  }

  // used to set the mode
  this.resetGlState = function() {
    if (clearGlState !== null) {
      clearGlState()
    }
    clearGlState = null
    draw = null
    resetDraw = null
  }
  this.resetDraw = function() {
    resetDraw()
  }
  this.useManyPoly = initManyPoly

  // init WebGL context with the default shaders
  this.useManyPoly()
}
// about the number of values received in 1/30th of a second
StrobeTuner.BUF_SZ = 4096
StrobeTuner.MIN_FIFO_SZ = 8192
