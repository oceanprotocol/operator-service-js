import { Pool, PoolClient } from "pg"; // Assuming you're using pg
import { checkAdmin } from "../utils";
import { KubeConfig, v1 } from "@kubernetes/client-node";
import KubeAPI from "../utils/kubernetes";
import Config from "../utils/config";

const pool = new Pool({
	connectionString: process.env.DATABASE_URL, // Get connection string from environment variables
});
const config = new Config();
const kubeAPI = new KubeAPI(config);

export async function initPgSql(admin: string) {
	const msg = await checkAdmin(admin);
	if (msg) {
		throw new Error(msg[0]);
	}

	try {
		const client = await pool.connect();
		try {
			await executeQueries(client);
			await createOrUpdateTables(client);
			await createIndices(client);
			await createFunction(client);
			await client.query("COMMIT");
			return "PostgreSQL database initialized successfully";
		} catch (error) {
			await client.query("ROLLBACK");
			throw new Error(`Error PostgreSQL: ${error}`);
		} finally {
			client.release();
		}
	} catch (error) {
		throw new Error(error);
	}
}

export async function getJobInfo(jobId: string) {
	try {
		const jobInfo = kubeAPI.getNamespacedCustomObject(jobId);
		return jobInfo;
	} catch (error) {
		throw new Error(`Error retrieving job information: ${error}`);
	}
}

export async function listJobs(admin: string) {
	try {
		const msg = await checkAdmin(admin);
		if (msg) {
			throw new Error(msg[0]);
		}
		const jobs = await kubeAPI.listNamespacedCustomObject(this.plural);
		return jobs;
	} catch (error) {
		throw new Error(`Error retrieving job information: ${error}`);
	}
}

async function executeQueries(client: PoolClient) {
	// Create the jobs table
	await client.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      agreementId varchar(255) NOT NULL,
      workflowId varchar(255) NOT NULL,
      owner varchar(255),
      status int,
      statusText varchar(255),
      laststatusupdate timestamp without time zone default NOW(),
      dateCreated timestamp without time zone default NOW(),
      dateFinished timestamp without time zone default NULL,
      configlogURL text,
      publishlogURL text,
      algologURL text,
      outputsURL text,
      ddo text,
      namespace varchar(255),
      stopreq smallint default 0,
      removed smallint default 0,
      workflow text,
      provider varchar(255),
      PRIMARY KEY (agreementId, workflowId)
    );
  `);

	// Create the envs table
	await client.query(`
    CREATE TABLE IF NOT EXISTS envs (
      namespace varchar(255) NOT NULL PRIMARY KEY,
      status text,
      lastping timestamp without time zone default NOW()
    );
  `);

	// Insert initial records into envs (replace with actual values)
	await client.query(`
    INSERT INTO envs (namespace, status)
    VALUES ('env1', 'active'), ('env2', 'inactive');
  `);
}

async function createOrUpdateTables(client: PoolClient) {
	// Add new column 'chainId' to jobs table
	await client.query(`
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS chainId varchar(255);
    `);

	// Create index on the 'owner' column in jobs table
	await client.query(`
      CREATE INDEX IF NOT EXISTS idx_owner_jobs ON jobs(owner);
    `);
}

async function createIndices(client: PoolClient) {
	// Create a unique index on the 'agreementId', 'workflowId', and 'namespace' columns in the 'jobs' table
	await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_job_unique_composite 
        ON jobs(agreementId, workflowId, namespace);
    `);

	// Create an index on the 'status' column in the 'envs' table
	await client.query(`
      CREATE INDEX IF NOT EXISTS idx_envs_status ON envs(status);
    `);
}

async function createFunction(client: PoolClient) {
	// Replace with your actual function definition and arguments
	await client.query(`
      CREATE OR REPLACE FUNCTION announce_job_completion(
        agreement_id varchar(255),
        workflow_id varchar(255),
        status int
      ) RETURNS void AS $$
      DECLARE
        job_record RECORD;
      BEGIN
        SELECT * INTO job_record FROM jobs WHERE agreement_id = $1 AND workflow_id = $2;
        
        -- Update job status based on your logic using job_record and $3 (status)
        UPDATE jobs SET status = $3 WHERE agreement_id = $1 AND workflow_id = $2;
        
        -- Additional logic or procedures based on completion (optional)
        
        -- Signal completion (e.g., call an external service, trigger an event)
        
      END;
      $$ LANGUAGE plpgsql;
    `);
}
