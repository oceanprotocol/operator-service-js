import {
	KubeConfig,
	CustomObjectsApi,
	CoreV1Api,
} from "@kubernetes/client-node";
import Config from "./config";

class KubeAPI {
	getPodLogs(name: any, namespace: any) {
		throw new Error("Method not implemented.");
	}
	private readonly k8sApi: CustomObjectsApi;
	private readonly coreApi: CoreV1Api;
	private readonly group: string;
	private readonly version: string;
	private readonly namespace: string;
	private readonly plural: string;

	constructor(config: Config) {
		try {
			const kc = new KubeConfig();
			kc.loadFromDefault();
			this.k8sApi = kc.makeApiClient(CustomObjectsApi);
			this.coreApi = kc.makeApiClient(CoreV1Api);
		} catch (error) {
			console.error("Failed to load Kubernetes configuration:", error);
			throw error;
		}

		this.group = config.group;
		this.version = config.version;
		this.namespace = config.namespace;
		this.plural = config.plural;
	}

	async listNamespacedCustomObject(kind: string): Promise<any> {
		try {
			const list = await this.k8sApi.listNamespacedCustomObject(
				this.group,
				this.version,
				this.namespace,
				kind
			);
			return list.response;
		} catch (error) {
			console.error(`Error listing ${kind} resources:`, error);
			throw error;
		}
	}

	async deleteNamespacedCustomObject(kind: string, name: string): Promise<any> {
		try {
			const resource = await this.k8sApi.deleteNamespacedCustomObject(
				this.group,
				this.version,
				this.namespace,
				this.plural,
				name
			);
			return resource;
		} catch (error) {
			console.error(`Error getting ${kind} resource "${name}":`, error);
			return undefined;
		}
	}

	async getNamespacedCustomObject(name: string): Promise<any> {
		try {
			const resource = await this.k8sApi.getNamespacedCustomObject(
				this.group,
				this.version,
				this.namespace,
				this.plural,
				name
			);
			return resource;
		} catch (error) {
			console.error(`Error getting resource "${name}":`, error);
			return undefined;
		}
	}

	async listNamespacedPod(labelSelector: string): Promise<any> {
		try {
			const resource = await this.coreApi.listNamespacedPod(
				this.namespace,
				null,
				null,
				null,
				null,
				labelSelector
			);
			return resource;
		} catch (error) {
			console.error(
				`Error getting listNamespacedPod for namespace ${this.namespace}:`,
				error
			);
			return undefined;
		}
	}

	async readNamespacedPodLog(name: string): Promise<any> {
		try {
			const resource = await this.coreApi.readNamespacedPodLog(
				name,
				this.namespace
			);
			return resource;
		} catch (error) {
			console.error(
				`Error getting listNamespacedPod for namespace ${this.namespace}:`,
				error
			);
			return undefined;
		}
	}
}

export default KubeAPI;
