module.exports = {
  getNetworkStateAsync: async () => ({
    isConnected: true,
    isInternetReachable: true,
    type: 'WIFI',
  }),
  getIpAddressAsync: async () => '192.168.1.100',
  NetworkStateType: {
    WIFI: 'WIFI',
    CELLULAR: 'CELLULAR',
    NONE: 'NONE',
    UNKNOWN: 'UNKNOWN',
  },
};

