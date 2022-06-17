const app = require('./system');

function middleware() {
  return function (req, res, next) {
    if (!app.isReady()) {
      return res.status(503).send('Service is not loaded yet');
    }

    req.getData = function getData() {
      let data;
      if (req.method.toLowerCase() === 'get') {
        data = { ...req.query, ...req.params };
      } else {
        data = { ...req.query, ...req.body, ...req.params };
      }
      return data; // TODO for raw - clear from metadata
    };
    req.getParams = function getParams(raw) {
      return raw ? req.params : req.params; // TODO for raw - clear from metadata
    };
    return next();
  };
}

module.exports = middleware;