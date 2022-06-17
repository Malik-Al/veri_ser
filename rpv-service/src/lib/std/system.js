process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const uuid = require('uuid');

const { EventEmitter } = require('events');

const log = require('./log');

const token = uuid.v4();

class System extends EventEmitter {
  debug = false;
  loaded = false;
  readyReqPoints = [];
  readyPoints = [];
  emited = false;
  getStartTime = () => { };
  getLessTime = () => { };
  now = () => { };

  constructor() {
    super();
  }

  isDebug() {
    return this.debug;
  }

  isDevEnv() {
    return process.env.NODE_ENV === 'development';
  }

  getEnv() {
    return process.env.NODE_ENV;
  }

  getLoaded() {
    return this.loaded;
  }

  isReady() {
    if (this.loaded && this.readyPoints.length
      === this.readyReqPoints.length) {
      return !this.readyReqPoints
        .some(required => !this.readyPoints.includes(required));
    }
    return false;
  }

  addReadyPoint(name) {
    if (!this.readyPoints.includes(name)) {
      this.readyReqPoints.push(name);
    }
    return name;
  }

  checkReady() {
    if (this.isReady()) {
      log.info('Приложение загружено и готово к работе');
      if (!this.emited) {
        this.emited = true;
        this.emit('app_ready');
      }
    }
  }

  resolveReadyPoint(name) {
    if (!this.readyPoints.includes(name)) {
      this.readyPoints.push(name);
      log.info(`Этап ${name} пройден`);
    }
    this.checkReady();
  }

  setLoaded() {
    this.loaded = true;
    this.checkReady();
  }

  getToken() {
    return token;
  }
}

module.exports = new System();