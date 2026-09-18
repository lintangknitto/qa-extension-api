import { Router, requestHandler } from '@knittotextile/knitto-http';
import controller from './home.controller';

const defaultRouter = Router();

defaultRouter.get('/', requestHandler(controller.home));

export default defaultRouter;
