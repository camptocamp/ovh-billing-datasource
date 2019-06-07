import _ from "lodash";

let cryptoJS = require('./crypto-js/index');

export class GenericDatasource {

  constructor(instanceSettings, $q, backendSrv, templateSrv) {
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
      apiServer: instanceSettings.jsonData.apiserver || "https://eu.api.ovh.com/1.0",
    };

  }

  query(options) {
    return this.buildQueryParameters(options).then(query => {
      query.targets = query.targets.filter(t => !t.hide);
      let from = options.range.from.clone();
      from.set('date', 1);
      from.set('hour', 0);
      from.set('minute', 0);
      let to = options.range.to.clone();
      return this.retrieveStats(query.targets, from.toISOString(), to.toISOString());
    });
  }

  retrieveStats(targets, from, to) {
    var targets_promises = [];

    targets.forEach((targetValue, targetIndex, targetArray) => {
      let params = "from="+from+"&to="+to;
      const promise = this.callApi("/cloud/project/" + targetValue.projectID + "/usage/history?" + params, "GET")
        .then(response => {
          let results = {
            "data": []
          };

          var datapoints_promises = [];
          response.data.forEach((value, index, array) => {
            const promise = this.getUsageFromID(targetValue.projectID, value.id).then(value => {
              return [
                [ value.totalPrice, Date.parse(value.from) ],
                [ value.totalPrice, Date.parse(value.to)],
              ];
            });
            datapoints_promises.push(promise);
          });

          const promise = this.getUsageForCurrentMonth(targetValue.projectID).then(value => {
            return [
                [ value.totalPrice, Date.parse(value.from) ],
                [ value.totalPrice, Date.parse(value.to)],
              ];
          });
          datapoints_promises.push(promise);

          return Promise.all(datapoints_promises).then(raw => {
            let datapoints = raw.flat();
            datapoints.sort(function(a, b) {
              return a[1] - b[1];
            });
            return { "target": targetValue.projectName, "datapoints": datapoints};
          });
        });
      targets_promises.push(promise);
    });

    return Promise.all(targets_promises).then(targets => {
      return {
        "data": targets,
      };
    });
  }

  getUsageFromID(projectID, usageID) {
    return this.callApi("/cloud/project/" + projectID + "/usage/history/" + usageID, "GET")
    .then(response => {
      let total = 0;
      total += parseUsage(response.data.hourlyUsage);
      total += parseUsage(response.data.monthlyUsage);
      return {
        "totalPrice": total,
        "from": response.data.period.from,
        "to": response.data.period.to,
      };
    })
  }

  getUsageForCurrentMonth(projectID) {
    return this.callApi("/cloud/project/" + projectID + "/usage/current", "GET")
    .then(response => {
      let total = 0;
      total += parseUsage(response.data.hourlyUsage);
      total += parseUsage(response.data.monthlyUsage);
      return {
        "totalPrice": total,
        "from": response.data.period.from,
        "to": response.data.period.to,
      };
    })
  }

  getProjectName(projectID) {
    return this.callApi("/cloud/project/" + projectID, "GET")
    .then(response => {
      return response.data.description;
    });
  }

  getTimestamp() {
    return this.backendSrv.datasourceRequest({
      url: this.ovh.apiServer + "/auth/time",
      method: 'GET',
    })
    .then(response => {
      return response.data;
    })
    .catch(e => {
      throw e;
    });
  }

  callApi(endpoint, method, body = "") {
    
    return this.getTimestamp().then(timestamp => {
      let url = this.ovh.apiServer + endpoint;
      let signature = "$1$" + cryptoJS.SHA1(this.ovh.appSecret + "+" + this.ovh.consumerKey + "+" + method + "+" + url + "+" + body + "+" + timestamp);

      return this.backendSrv.datasourceRequest({
        url: url,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'X-Ovh-Application': this.ovh.appKey,
          'X-Ovh-Timestamp': timestamp,
          'X-Ovh-Signature': signature,
          'X-Ovh-Consumer': this.ovh.consumerKey,
        },
      })
      .then(response => {
        return response;
      });
    });

  }

  testDatasource() {
    return this.callApi("/cloud/project", "GET")
      .then(response => {
        return { status: "success", message: "Data source is working", title: "Success" };
      })
      .catch(e => {
        return { status: "error", message: e.status + " " + e.statusText + " - " + e.data.message, title: "Error" };
      });
  }


  buildQueryParameters(options) {
    //remove placeholder targets
    options.targets = _.filter(options.targets, target => {
      return target.target !== undefined;
    });

    var targets = _.map(options.targets, target => {
      return {
        target: target.target,
        refId: target.refId,
        hide: target.hide,
        type: target.type || 'timeserie',
        projectID: target.target,
        projectName: target.target,
      };
    });

    var promises = [];
    targets.forEach((value, index, array) => {
      const promise = this.getProjectName(value.projectID).then(name => {
        return name;
      });
      promises.push(promise);
    });

    return Promise.all(promises).then(names => {
      names.forEach((value, index, array) => {
        targets[index].projectName = value;
        targets[index].legendFormat = value;
      });
      options.targets = targets; 
      return options;
    });
  }
}

export function parseUsage(data) {
  let total = 0;
  
  // Instance
  for(var i in data.instance) {
    total += data.instance[i].totalPrice;
  }

  // Snapshot
  for(var i in data.snapshot) {
    total += data.snapshot[i].totalPrice;
  }

  // Storage
  for(var i in data.storage) {
    total += data.storage[i].totalPrice;
  }

  // Volume
  for(var i in data.volume) {
    total += data.volume[i].totalPrice;
  }

  return total;
}
