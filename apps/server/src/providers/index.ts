/* eslint-disable @typescript-eslint/naming-convention */
import { MxApi } from "./mx"
import { SophtronApi } from "./sophtron"
import { AkoyaApi } from "./akoya"
import { FinicityApi } from "./finicity"
import config from "../config"
import * as logger from "../infra/logger"
import type {
  Challenge,
  Credential,
  Connection,
  Context,
  Institution,
  ProviderApiClient,
  CreateConnectionRequest,
  UpdateConnectionRequest,
} from "../shared/contract"
import { ConnectionStatus, OAuthStatus } from "../shared/contract"
import { AnalyticsClient } from "../serviceClients/analyticsClient"
import { SearchClient } from "../serviceClients/searchClient"
import { StorageClient } from "../serviceClients/storageClient"
import { decodeAuthToken } from "../utils"
import providerCredentials from "../providerCredentials"

function getApiClient(provider: string, config: any): ProviderApiClient {
  switch (provider) {
    case "mx":
      return new MxApi(config, false)
    case "mx_int":
      return new MxApi(config, true)
    case "sophtron":
      return new SophtronApi(config)
    case "akoya":
      return new AkoyaApi(config, false)
    case "akoya_sandbox":
      return new AkoyaApi(config, true)
    case "finicity":
      return new FinicityApi(config, false)
    case "finicity_sandbox":
      return new FinicityApi(config, true)
    default:
      // throw new Error(`Unsupported provider ${provider}`);
      return null
  }
}

export async function instrumentation(context: Context, input: any) {
  const { user_id } = input
  context.user_id = user_id
  if (!user_id || user_id === "undefined" || user_id === "test") {
    if (config.Demo) {
      logger.info("Using demo userId")
      context.user_id = "Universal_widget_demo_user"
    } else {
      logger.info("Missing userId")
      return false
    }
  }
  if (Boolean(input.current_member_guid) && Boolean(input.current_provider)) {
    context.provider = input.current_provider
    context.connection_id = input.current_member_guid
  }
  if (input.auth != null) {
    context.auth = decodeAuthToken(input.auth)
  }
  context.partner = input.current_partner
  context.job_type = input.job_type ?? "agg"
  context.scheme = input.scheme ?? "vcs"
  context.oauth_referral_source = input.oauth_referral_source ?? "BROWSER"
  context.single_account_select = input.single_account_select
  context.updated = true
  return true
}

export class ProviderApiBase {
  context: Context
  serviceClient: ProviderApiClient
  analyticsClient: AnalyticsClient
  storageClient: StorageClient
  searchApi: SearchClient
  providers: string[]
  constructor(req: any) {
    this.context = req.context
  }

  async init() {
    this.searchApi = new SearchClient(this.context.auth?.token)
    const token = "fakeTokenThatWeNeedToRemove"

    this.storageClient = new StorageClient()
    this.analyticsClient = new AnalyticsClient(token)
    try {
      const conf = providerCredentials
      this.serviceClient = getApiClient(this.context?.provider, {
        ...conf,
        storageClient: this.storageClient,
      })
      this.providers = Object.values(conf)
        .filter((v: any) => v.available)
        .map((v: any) => v.provider)
      return true
    } catch (err) {
      logger.error("Error parsing auth token", err)
    }

    return false
  }

  async institutions() {
    return await this.searchApi.institutions()
  }

  async search(query: string) {
    this.context.updated = true
    this.context.provider = null
    const q = query as any
    if (q.search_name != null && q.search_name !== "") {
      query = q.search_name
    }
    if (query?.length >= 3) {
      const list = await this.searchApi.institutions(query, this.providers)
      return list?.institutions?.sort(
        (a: any, b: any) => a.name.length - b.name.length
      )
    }
    return []
  }

  // This is not getting the logo url for any Finicity banks, needs to be fixed on search client probably. Mapping is wrong.
  async resolveInstitution(id: string): Promise<Institution> {
    this.context.updated = true
    const ret = {
      id,
    } as any
    if (
      !this.context.provider ||
      (this.context.institution_uid &&
        this.context.institution_uid !== id &&
        this.context.institution_id !== id)
    ) {
      const resolved = await this.searchApi.resolve(id)
      if (resolved != null) {
        logger.debug(
          `resolved institution ${id} to provider ${resolved.provider} ${resolved.target_id}`
        )
        this.context.provider = resolved.provider
        this.context.institution_uid = id
        ret.id = resolved.target_id
        ret.url = resolved.url
        ret.name = resolved.name
        ret.logo_url = resolved.logo_url
      }
    }
    if (this.context.provider == null || this.context.provider === "") {
      this.context.provider = config.DefaultProvider
    }
    await this.init()
    this.context.institution_id = ret.id
    this.context.resolved_user_id = null
    return ret
  }

  async getInstitution(guid: string): Promise<any> {
    console.log("here")
    const resolved = await this.resolveInstitution(guid)
    const inst = await this.serviceClient.GetInstitutionById(resolved.id)
    if (inst != null) {
      inst.name = resolved.name ?? inst.name
      inst.url = resolved?.url ?? inst.url?.trim()
      inst.logo_url = resolved?.logo_url ?? inst.logo_url?.trim()
    }
    return inst
  }

  async getInstitutionCredentials(guid: string): Promise<Credential[]> {
    this.context.updated = true
    this.context.current_job_id = null
    // let id = await this.resolveInstitution(guid)
    return await this.serviceClient.ListInstitutionCredentials(guid)
  }

  async getConnection(connection_id: string): Promise<Connection> {
    return await this.serviceClient.GetConnectionById(
      connection_id,
      this.getUserId()
    )
  }

  async getConnectionStatus(connection_id: string): Promise<Connection> {
    return await this.serviceClient.GetConnectionStatus(
      connection_id,
      this.context.current_job_id,
      this.context.single_account_select,
      this.getUserId()
    )
  }

  async createConnection(
    connection: CreateConnectionRequest
  ): Promise<Connection> {
    this.context.updated = true
    this.context.current_job_id = null
    const ret = await this.serviceClient.CreateConnection(
      connection,
      this.getUserId()
    )
    this.context.current_job_id = ret.cur_job_id
    if (ret?.id != null) {
      await this.storageClient.set(`context_${ret.id}`, {
        oauth_referral_source: this.context.oauth_referral_source,
        scheme: this.context.scheme,
      })
    }
    return ret
  }

  async updateConnection(
    connection: UpdateConnectionRequest
  ): Promise<Connection> {
    const ret = await this.serviceClient.UpdateConnection(
      connection,
      this.getUserId()
    )
    this.context.updated = true
    this.context.current_job_id = ret.cur_job_id
    if (ret?.id != null) {
      await this.storageClient.set(`context_${ret.id}`, {
        oauth_referral_source: this.context.oauth_referral_source,
        scheme: this.context.scheme,
      })
    }
    return ret
  }

  async answerChallenge(connection_id: string, challenges: Challenge[]) {
    return await this.serviceClient.AnswerChallenge(
      {
        id: connection_id ?? this.context.connection_id,
        challenges,
      },
      this.context.current_job_id,
      this.getUserId()
    )
  }

  async getOauthWindowUri(memberGuid: string) {
    const ret = await this.getConnection(memberGuid)
    return ret?.oauth_window_uri
  }

  async getOauthState(connection_id: string) {
    const connection = await this.getConnectionStatus(connection_id)
    if (connection == null) {
      return {}
    }
    const ret = {
      guid: connection_id,
      inbound_member_guid: connection_id,
      outbound_member_guid: connection_id,
      auth_status:
        connection.status === ConnectionStatus.PENDING
          ? OAuthStatus.PENDING
          : ConnectionStatus.CONNECTED
            ? OAuthStatus.COMPLETE
            : OAuthStatus.ERROR,
    } as any
    if (ret.auth_status === OAuthStatus.ERROR) {
      ret.error_reason = connection.status
    }
    return { oauth_state: ret }
  }

  async getOauthStates(memberGuid: string) {
    const state = await this.getOauthState(memberGuid)
    return {
      oauth_states: [state.oauth_state],
    }
  }

  async deleteConnection(connection_id: string): Promise<void> {
    await this.serviceClient.DeleteConnection(connection_id, this.getUserId())
  }

  async getConnectionCredentials(memberGuid: string): Promise<Credential[]> {
    this.context.updated = true
    this.context.current_job_id = null
    return await this.serviceClient.ListConnectionCredentials(
      memberGuid,
      this.getUserId()
    )
  }

  async ResolveUserId(id: string) {
    return await this.serviceClient?.ResolveUserId(id)
  }

  getUserId(): string {
    return this.context.resolved_user_id
  }

  static async handleOauthResponse(
    provider: string,
    rawParams: any,
    rawQueries: any,
    body: any
  ) {
    let res = {} as any
    switch (provider) {
      case "akoya":
      case "akoya_sandbox":
        res = await AkoyaApi.HandleOauthResponse({
          ...rawQueries,
          ...rawParams,
        })
        break
      case "finicity":
      case "finicity_sandbox":
        res = await FinicityApi.HandleOauthResponse({
          ...rawQueries,
          ...rawParams,
          ...body,
        })
        break
      case "mx":
      case "mx_int":
        res = await MxApi.HandleOauthResponse({
          ...rawQueries,
          ...rawParams,
          ...body,
        })
        break
    }
    const ret = {
      ...res,
      provider,
    }
    if (res?.storageClient != null && res?.id != null) {
      const context = await res.storageClient.get(
        `context_${ret.request_id ?? ret.id}`
      )
      ret.scheme = context.scheme
      ret.oauth_referral_source = context.oauth_referral_source
    }
    return ret
  }

  async analytics(path: string, content: any) {
    return await this.analyticsClient?.analytics(
      path.replaceAll("/", ""),
      content
    )
  }
}
