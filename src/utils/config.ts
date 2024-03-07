class Config {
	public readonly config: string;
	public group: string;
	public version: string;
	public namespace: string;
	public plural: string;
	public url: string;

	constructor() {
		this.url = process.env.OPERATOR_URL || "http://localhost:8050";
		this.group = process.env.NAMESPACE || "ocean-compute";
		this.group = process.env.GROUP || "oceanprotocol.com";
		this.version = process.env.VERSION || "v1alpha";
		this.plural = process.env.PLURAL || "workflows";
	}
}

export default Config;
