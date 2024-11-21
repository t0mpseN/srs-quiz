const API_URL = process.env.NODE_ENV === 'production' 
    ? '' // Empty string means same domain
    : 'http://192.168.1.27:3000';

export default API_URL;