'use strict'

function StrobeTuner(audioCtx, glCtx) {
  var me = this
  var log = function(str) {
    console.log(str)
  }

  // Audio related stuff
  this.buffer = new Float32Array(StrobeTuner.BUF_SZ)
  this.bufferLen = StrobeTuner.BUF_SZ
  this.sampleRate = 0

  this.baseFrequency = 440.0
  this.sampleOffset = 0

  this.autoGain = true

  this.newData = false
  this.audioNode = audioCtx.createScriptProcessor(256)
  this.audioNode.onaudioprocess = function(e) {
    var buf = e.inputBuffer
    // log('got data')
    // log(buf.length)

    me.sampleRate = buf.sampleRate
    if (buf.length >= me.bufferLen) {
      // resize the buffer
      if (me.buffer.length > StrobeTuner.BUF_SZ) {
        log('audio overflow!')
      }

      buf.copyFromChannel(me.buffer, 0, buf.length - me.bufferLen)
    } else {
      me.buffer.copyWithin(0, buf.length)
      buf.copyFromChannel(me.buffer.subarray(me.bufferLen - buf.length), 0, 0)
    }

    me.sampleOffset = me.sampleOffset + buf.length
    me.sampleOffset = me.sampleOffset - Math.floor(me.sampleOffset*(me.baseFrequency/(1000*me.sampleRate)))/(me.baseFrequency/(1000*me.sampleRate))

    me.newData = true
  }
  this.flushBuffer = function() {
    this.newData = false
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

    draw = function() {
      if (!inited) {
        return
      }
      if (!me.newData) {
        return
      }
      // console.log(me.bufferLen)
      console.log(me.sampleOffset)
      // glCtx.enableVertexAttribArray(vertexTexCoord)

      var vertexData = new Float32Array(4*(2+3)*me.bufferLen)
      var vertexIdxs = new Uint16Array(2*3*me.bufferLen)

      var scale = 1.0
      if (me.autoGain) {
        var bufMax = 0.001
        for (var i = 0; i < me.bufferLen; i++) {
          var absVal = Math.abs(me.buffer[i])
          if (bufMax < absVal) {
            bufMax = absVal
          }
        }
        scale = 0.01/bufMax
      }

      for (var i = 0; i < me.bufferLen; i++) {
        var curOffset = (me.sampleOffset - me.bufLen + i)*me.baseFrequency/me.sampleRate
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
      for (var i = 0; i < me.bufferLen; i++) {
        vertexIdxs[2*3*i + 0] = 4*i + 0;
        vertexIdxs[2*3*i + 1] = 4*i + 1;
        vertexIdxs[2*3*i + 2] = 4*i + 2;
        vertexIdxs[2*3*i + 3] = 4*i + 0;
        vertexIdxs[2*3*i + 4] = 4*i + 2;
        vertexIdxs[2*3*i + 5] = 4*i + 3;
      }

      // log(me.bufferLen)
      glCtx.bindBuffer(glCtx.ARRAY_BUFFER, vertexBuf)
      glCtx.bufferData(glCtx.ARRAY_BUFFER, vertexData, glCtx.DYNAMIC_DRAW)

      glCtx.clear(glCtx.COLOR_BUFFER_BIT)

      glCtx.vertexAttribPointer(vertexPosition, 2, glCtx.FLOAT, false, 5*4, 0)
      glCtx.vertexAttribPointer(vertexTexCoord, 3, glCtx.FLOAT, false, 5*4, 2*4)

      glCtx.bindBuffer(glCtx.ELEMENT_ARRAY_BUFFER, vertexIndexBuf)
      glCtx.bufferData(glCtx.ELEMENT_ARRAY_BUFFER, vertexIdxs, glCtx.DYNAMIC_DRAW)

      glCtx.uniform1f(gainUniform, (me.brightGain/me.bufferLen))
      glCtx.uniform1f(offsetUniform, me.brightOffset/me.bufferLen)

      glCtx.drawElements(glCtx.TRIANGLES, 2*me.bufferLen, glCtx.UNSIGNED_SHORT, 0)
      glCtx.finish()
    }

    clearGlState = function() {
      // TODO
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
  this.resetGlState = function() {
    if (clearGlState !== null) {
      clearGlState()
    }
    clearGlState = null
    draw = null
  }
  this.useManyPoly = initManyPoly

  // init WebGL context with the default shaders
  this.useManyPoly()
}
// about the number of values received in 1/30th of a second
StrobeTuner.BUF_SZ = 2048
StrobeTuner.MAX_BUF_SZ = 16384
