'use strict'

function Tone(note, base, cents) {
  var offsets = {
    'a': 0,
    'b': 2,
    'c': 3,
    'd': 5,
    'e': 7,
    'f': 8,
    'g': 10,
  }


  var calculateFromNote = function(n) {
    var trimmed = n.trim()
    var offset = offsets[n[0].toLowerCase()] || 0
    var nFlats = n.split('').filter(function(c) { return c == 'b' }).length
    var nSharps = n.split('').filter(function(c) { return c == '#' }).length
    var num = parseInt(/[-+]?[0-9]+$/.exec(n))
    return num*12 + offset - nFlats + nSharps
  }

  this.note = calculateFromNote(note)
  this.cents = cents
  this.baseFreq = base

  this.pitch = function() {
    return this.baseFreq*(Math.pow(2, (this.note - 48 + this.cents/100)/12))
  }

  this.raiseSemitone = function() {
    this.note += 1
  }
  this.lowerSemitone = function() {
    this.note -= 1
  }
  this.raiseOctave = function() {
    this.note += 12
  }
  this.lowerOctave = function() {
    this.note -= 12
  }

  this.toString = function() {
    var letter = this.note % 12
    var octave = Math.floor(this.note/12)
    var noteNames = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#']
    return noteNames[letter] + octave.toString()
  }
}
