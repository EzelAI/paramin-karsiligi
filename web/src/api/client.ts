import { IS_STATIC } from '../lib/storage';
import { httpApi } from './http';
import { localApi } from './local';

export const api = IS_STATIC ? localApi : httpApi;
