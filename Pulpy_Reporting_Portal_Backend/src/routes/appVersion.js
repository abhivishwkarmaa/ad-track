import appVersionService from '../services/appVersion.service.js';

async function appVersionRoutes(fastify) {
  fastify.get('/version', async () => {
    return appVersionService.getAppVersionContract();
  });
}

export default appVersionRoutes;

