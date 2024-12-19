import { getSophtronAdapterMapObject } from "@ucp-npm/sophtron-adapter";
import { getTemplateAdapterMapObject } from "@ucp-npm/template-adapter";
import type { AdapterMap } from "@repo/utils";
import { adapterMapObject as testAdapterMapObject } from "./test-adapter";
import config from "./config";
import * as logger from "./infra/logger";

const templateAdapterMapObject = getTemplateAdapterMapObject();

const sophtronAdapterMapObject: Record<string, AdapterMap> =
  getSophtronAdapterMapObject({
    logClient: logger,
    aggregatorCredentials: {
      clientId: config.SOPHTRON_API_USER_ID,
      secret: config.SOPHTRON_API_USER_SECRET,
    },
    envConfig: {
      HOSTURL: config.HOST_URL,
    },
  });

// This is where you add adapters
export const adapterMap: Record<string, AdapterMap> = {
  ...sophtronAdapterMapObject,
  ...templateAdapterMapObject,
  ...testAdapterMapObject,
};
export type Aggregator = keyof typeof adapterMap;
export const aggregators = Object.keys(adapterMap);
