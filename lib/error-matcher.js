'use strict';

var fs = require('fs');
var path = require('path');
var XRegExp = require('xregexp').XRegExp;
var GoogleAnalytics = require('./google-analytics');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var _ = require('lodash');

module.exports = (function () {

  function ErrorMatcher() {
    this.regex = null;
    this.cwd = null;
    this.stdout = null;
    this.stderr = null;
    this.currentMatch = [];

    atom.commands.add('atom-workspace', 'build:error-match', this.match.bind(this));
    atom.commands.add('atom-workspace', 'build:error-match-first', this.matchFirst.bind(this));
  }

  util.inherits(ErrorMatcher, EventEmitter);

  ErrorMatcher.prototype._gotoNext = function () {
    this._goto(this.currentMatch[0].id);
    this.currentMatch.push(this.currentMatch.shift());
  };

  ErrorMatcher.prototype._goto = function (id) {
    var match = _.findWhere(this.currentMatch, { id: id });
    if (!match.file) {
      return this.emit('error', 'Did not match any file. Don\'t know what to open.');
    }

    if (!path.isAbsolute(match.file)) {
      match.file = this.cwd + path.sep + match.file;
    }

    var row = match.line ? match.line - 1 : 0; /* Because atom is zero-based */
    var col =  match.col ? match.col - 1 : 0; /* Because atom is zero-based */

    fs.exists(match.file, function (exists) {
      if (!exists) {
        return this.emit('error', 'Matched file does not exist: ' + match.file);
      }
      atom.workspace.open(match.file, {
        initialLine: row,
        initialColumn: col,
        searchAllPanes: true
      });
      this.emit('scroll', match.type, match.id);
    }.bind(this));
  };

  ErrorMatcher.prototype._parse = function () {
    this.currentMatch = XRegExp.forEach(this.output, this.regex, function (match, i) {
      match.type = 'error';
      match.id = 'error-' + i;
      this.push(match);
    }, []);

    var output = '';
    var lastEnd = 0;
    for (var matchIndex in this.currentMatch) {
      var match = this.currentMatch[matchIndex];

      output += _.escape(this.output.substr(lastEnd, match.index - lastEnd));
      output += util.format('<a class="%s" id="%s">%s</a>', match.type, match.id, _.escape(match[0]));
      lastEnd = match.index + match[0].length;
    }
    output += _.escape(this.output.substr(lastEnd));

    this.emit('replace', output, this._goto.bind(this));
    return this.currentMatch.length;
  };

  ErrorMatcher.prototype.set = function (regex, cwd, output) {
    try {
      this.regex = XRegExp(regex);
    } catch (err) {
      this.regex = null;
      return this.emit('error', 'Error parsing regex:\n' + err);
    }
    this.cwd = cwd;
    this.output = output;
    this.currentMatch = [];
  };

  ErrorMatcher.prototype.match = function () {
    if (!this.regex) {
      return;
    }

    GoogleAnalytics.sendEvent('errorMatch', 'match');

    if (0 === this.currentMatch.length && 0 === this._parse()) {
      return;
    }

    this._gotoNext();
  };

  ErrorMatcher.prototype.matchFirst = function () {
    if (!this.regex) {
      return;
    }

    GoogleAnalytics.sendEvent('errorMatch', 'first');

    if (0 === this._parse()) {
      return;
    }

    this._gotoNext();
  };

  return ErrorMatcher;
})();
