export function createComputeJob(
	workflow: object,
	executionId: string,
	namespace: string
): object {
	const execution: object = {};
	execution["apiVersion"] = "v0.0.1";
	execution["kind"] = "WorkFlow";
	execution["metadata"] = {};
	execution["metadata"]["name"] = executionId;
	execution["metadata"]["namespace"] = namespace;
	execution["metadata"]["labels"] = {};
	execution["metadata"]["labels"]["workflow"] = executionId;
	execution["spec"] = {};
	execution["spec"]["metadata"] = workflow;
	return execution;
}

export function getComputeResources(): { [key: string]: string } {
	const resources: { [key: string]: string } = {};
	resources["inputVolumesize"] = process.env.INPUT_VOLUMESIZE || "1Gi";
	resources["outputVolumesize"] = process.env.OUTPUT_VOLUMESIZE || "1Gi";
	resources["adminlogsVolumesize"] = process.env.ADMINLOGS_VOLUMESIZE || "1Gi";
	resources["requests_cpu"] = process.env.REQUESTS_CPU || "200m";
	resources["requests_memory"] = process.env.REQUESTS_MEMORY || "100Mi";
	resources["limits_cpu"] = process.env.LIMITS_CPU || "1";
	resources["limits_memory"] = process.env.LIMITS_MEMORY || "500Mi";
	return resources;
}
