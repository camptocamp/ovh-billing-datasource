"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.GenericDatasource = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

exports.parseUsage = parseUsage;

var _lodash = require("lodash");

var _lodash2 = _interopRequireDefault(_lodash);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var cryptoJS = require('./crypto-js/index');

var GenericDatasource = exports.GenericDatasource = function () {
  function GenericDatasource(instanceSettings, $q, backendSrv, templateSrv) {
    _classCallCheck(this, GenericDatasource);

    this.type = instanceSettings.type;
    this.url = instanceSettings.url;
    this.name = instanceSettings.name;
    this.q = $q;
    this.backendSrv = backendSrv;
    this.templateSrv = templateSrv;

    this.ovh = {
      appKey: instanceSettings.jsonData.application_key,
      appSecret: instanceSettings.jsonData.application_secret,
      consumerKey: instanceSettings.jsonData.consumer_key,
      apiServer: instanceSettings.jsonData.apiserver || "https://eu.api.ovh.com/1.0"
    };
  }

  _createClass(GenericDatasource, [{
    key: "query",
    value: function query(options) {
      var _this = this;

      return this.buildQueryParameters(options).then(function (query) {
        query.targets = query.targets.filter(function (t) {
          return !t.hide;
        });
        var from = options.range.from.clone();
        from.set('date', 1);
        from.set('hour', 0);
        from.set('minute', 0);
        var to = options.range.to.clone();
        return _this.retrieveStats(query.targets, from.toISOString(), to.toISOString());
      });
    }
  }, {
    key: "retrieveStats",
    value: function retrieveStats(targets, from, to) {
      var _this2 = this;

      var targets_promises = [];

      targets.forEach(function (targetValue, targetIndex, targetArray) {
        var params = "from=" + from + "&to=" + to;
        var promise = _this2.callApi("/cloud/project/" + targetValue.projectID + "/usage/history?" + params, "GET").then(function (response) {
          var results = {
            "data": []
          };

          var datapoints_promises = [];
          response.data.forEach(function (value, index, array) {
            var promise = _this2.getUsageFromID(targetValue.projectID, value.id).then(function (value) {
              return [[value.totalPrice, Date.parse(value.from)], [value.totalPrice, Date.parse(value.to)]];
            });
            datapoints_promises.push(promise);
          });

          var promise = _this2.getUsageForCurrentMonth(targetValue.projectID).then(function (value) {
            return [[value.totalPrice, Date.parse(value.from)], [value.totalPrice, Date.parse(value.to)]];
          });
          datapoints_promises.push(promise);

          return Promise.all(datapoints_promises).then(function (raw) {
            var datapoints = raw.flat();
            datapoints.sort(function (a, b) {
              return a[1] - b[1];
            });
            return { "target": targetValue.projectName, "datapoints": datapoints };
          });
        });
        targets_promises.push(promise);
      });

      return Promise.all(targets_promises).then(function (targets) {
        return {
          "data": targets
        };
      });
    }
  }, {
    key: "getUsageFromID",
    value: function getUsageFromID(projectID, usageID) {
      return this.callApi("/cloud/project/" + projectID + "/usage/history/" + usageID, "GET").then(function (response) {
        var total = 0;
        total += parseUsage(response.data.hourlyUsage);
        total += parseUsage(response.data.monthlyUsage);
        return {
          "totalPrice": total,
          "from": response.data.period.from,
          "to": response.data.period.to
        };
      });
    }
  }, {
    key: "getUsageForCurrentMonth",
    value: function getUsageForCurrentMonth(projectID) {
      return this.callApi("/cloud/project/" + projectID + "/usage/current", "GET").then(function (response) {
        var total = 0;
        total += parseUsage(response.data.hourlyUsage);
        total += parseUsage(response.data.monthlyUsage);
        return {
          "totalPrice": total,
          "from": response.data.period.from,
          "to": response.data.period.to
        };
      });
    }
  }, {
    key: "getProjectName",
    value: function getProjectName(projectID) {
      return this.callApi("/cloud/project/" + projectID, "GET").then(function (response) {
        return response.data.description;
      });
    }
  }, {
    key: "getTimestamp",
    value: function getTimestamp() {
      return this.backendSrv.datasourceRequest({
        url: this.ovh.apiServer + "/auth/time",
        method: 'GET'
      }).then(function (response) {
        return response.data;
      }).catch(function (e) {
        throw e;
      });
    }
  }, {
    key: "callApi",
    value: function callApi(endpoint, method) {
      var _this3 = this;

      var body = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : "";


      return this.getTimestamp().then(function (timestamp) {
        var url = _this3.ovh.apiServer + endpoint;
        var signature = "$1$" + cryptoJS.SHA1(_this3.ovh.appSecret + "+" + _this3.ovh.consumerKey + "+" + method + "+" + url + "+" + body + "+" + timestamp);

        return _this3.backendSrv.datasourceRequest({
          url: url,
          method: method,
          headers: {
            'Content-Type': 'application/json',
            'X-Ovh-Application': _this3.ovh.appKey,
            'X-Ovh-Timestamp': timestamp,
            'X-Ovh-Signature': signature,
            'X-Ovh-Consumer': _this3.ovh.consumerKey
          }
        }).then(function (response) {
          return response;
        });
      });
    }
  }, {
    key: "testDatasource",
    value: function testDatasource() {
      return this.callApi("/cloud/project", "GET").then(function (response) {
        return { status: "success", message: "Data source is working", title: "Success" };
      }).catch(function (e) {
        return { status: "error", message: e.status + " " + e.statusText + " - " + e.data.message, title: "Error" };
      });
    }
  }, {
    key: "buildQueryParameters",
    value: function buildQueryParameters(options) {
      var _this4 = this;

      //remove placeholder targets
      options.targets = _lodash2.default.filter(options.targets, function (target) {
        return target.target !== undefined;
      });

      var targets = _lodash2.default.map(options.targets, function (target) {
        return {
          target: target.target,
          refId: target.refId,
          hide: target.hide,
          type: target.type || 'timeserie',
          projectID: target.target,
          projectName: target.target
        };
      });

      var promises = [];
      targets.forEach(function (value, index, array) {
        var promise = _this4.getProjectName(value.projectID).then(function (name) {
          return name;
        });
        promises.push(promise);
      });

      return Promise.all(promises).then(function (names) {
        names.forEach(function (value, index, array) {
          targets[index].projectName = value;
          targets[index].legendFormat = value;
        });
        options.targets = targets;
        return options;
      });
    }
  }]);

  return GenericDatasource;
}();

function parseUsage(data) {
  var total = 0;

  // Instance
  for (var i in data.instance) {
    total += data.instance[i].totalPrice;
  }

  // Snapshot
  for (var i in data.snapshot) {
    total += data.snapshot[i].totalPrice;
  }

  // Storage
  for (var i in data.storage) {
    total += data.storage[i].totalPrice;
  }

  // Volume
  for (var i in data.volume) {
    total += data.volume[i].totalPrice;
  }

  return total;
}
//# sourceMappingURL=datasource.js.map
