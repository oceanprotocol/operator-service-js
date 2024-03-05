import { CustomObjectsApi, CoreV1Api } from '@kubernetes/client-js'

const logger = console // Replace with your logging library

// Configuration to connect to k8s.
try {
  const config = kubernetes.loadConfig() // Use kubernetes.loadConfig()
} catch (error) {
  logger.error('Failed to load Kubernetes config:', error)
  process.exit(1)
}

export class KubeAPI {
  //   // Create instances of the API classes
  //   private apiCustomObject: CustomObjectsApi = new CustomObjectsApi(config)
  //   private apiCore: CoreV1Api = new CoreV1Api(config)

  // Configuration loaded from Config class
  private group: string
  private version: string
  private namespace: string
  private plural: string

  constructor(config?: Config) {
    if (!config) {
      config = new Config()
    }
    this.group = config.group
    this.version = config.version
    this.namespace = config.namespace
    this.plural = config.plural
  }

  // Create a namespaced custom object
  public async createNamespacedCustomObject(body: any): Promise<void> {
    try {
      await this.apiCustomObject.createNamespacedCustomObject(
        this.group,
        this.version,
        this.namespace,
        this.plural,
        body
      )
    } catch (error) {
      logger.error('Error creating namespaced custom object:', error)
      throw error // Re-throw for further handling
    }
  }

  // Get a namespaced custom object
  public async getNamespacedCustomObject(jobId: string): Promise<any | undefined> {
    try {
      const response = await this.apiCustomObject.getNamespacedCustomObject(
        this.group,
        this.version,
        this.namespace,
        this.plural,
        jobId
      )
      return response.body
    } catch (error) {
      logger.error('Error getting namespaced custom object:', error)
      return undefined
    }
  }

  // List namespaced custom objects
  public async listNamespacedCustomObject(): Promise<any[]> {
    try {
      const response = await this.apiCustomObject.listNamespacedCustomObject(
        this.group,
        this.version,
        this.namespace,
        this.plural
      )
      return response.body.items
    } catch (error) {
      logger.error('Error listing namespaced custom objects:', error)
      return []
    }
  }

  // Delete a namespaced custom object
  public async deleteNamespacedCustomObject(
    name: string,
    body: any,
    gracePeriodSeconds?: number,
    orphanDependents?: boolean,
    propagationPolicy?: string
  ): Promise<void> {
    try {
      await this.apiCustomobject.deleteNamespacedCustomObject(
        this.group,
        this.version,
        this.namespace,
        this.plural,
        name,
        body,
        {
          gracePeriodSeconds,
          orphanDependents,
          propagationPolicy
        }
      )
    } catch (error) {
      logger.error('Error deleting namespaced custom object:', error)
      throw error // Re-throw for further handling
    }
  }

  // Read logs from a namespaced pod
  public async readNamespacedPodLog(name: string): Promise<string> {
    try {
      const response = await this.apiCore.readNamespacedPodLog(name, this.namespace)
      return response.body
    } catch (error) {
      logger.error('Error reading namespaced pod log:', error)
      return ''
    }
  }

  // List pods in a namespace with a label selector
  public async listNamespacedPod(labelSelector?: string): Promise<any[]> {
    try {
      const response = await this.apiCore.listNamespacedPod(this.namespace, {
        labelSelector
      })
      return response.body.items
    } catch (error) {
      logger.error('Error listing')
    }
    return []
  }
}
