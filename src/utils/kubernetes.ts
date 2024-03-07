import {
	KubeConfig,
	CustomObjectsApi,
	CoreV1Api,
} from "@kubernetes/client-node";
import Config from "./config";

class KubeAPI {
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
		} catch (error) {
			console.error("Failed to load Kubernetes configuration:", error);
			throw error;
		}

		this.group = config.group;
		this.version = config.version;
		this.namespace = config.namespace;
		this.plural = config.plural;
	}
	async listResourcesByName(kind: string): Promise<any> {
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

	async delete_namespaced_custom_object(
		kind: string,
		name: string
	): Promise<any> {
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

	async getResourceByName(name: string): Promise<any> {
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

	// async readNamespacedPodLog(kind: string, name: string): Promise<any> {
	// 	try {
	// 		const resource = await this.k8sApi.readNamespacedPodLog(
	// 			this.group,
	// 			this.version,
	// 			this.namespace,
	// 			kind,
	// 			name
	// 		);
	// 		return resource;
	// 	} catch (error) {
	// 		console.error(`Error getting ${kind} resource "${name}":`, error);
	// 		return undefined;
	// 	}
	// }
}

export default KubeAPI;
