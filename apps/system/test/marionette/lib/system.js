function System(client) {
  this.client = client.scope({
    searchTimeout: 20000
  });
}

module.exports = System;

System.Selector = Object.freeze({
  leftPanel: '#left-panel',
  rightPanel: '#right-panel'
});

System.prototype = {
  client: null,

  get leftPanel() {
    return this.client.findElement(System.Selector.leftPanel);
  },

  get rightPanel() {
    return this.client.findElement(System.Selector.rightPanel);
  },

  getAppIframe: function(url) {
    return this.client.findElement('iframe[src*="' + url + '"]');
  },

  waitForLaunch: function(url) {
    this.client.apps.launch(url);
    var iframe = this.getAppIframe(url);
    this.client.waitFor(function() {
      return iframe.displayed();
    });

    return iframe;
  }
};
