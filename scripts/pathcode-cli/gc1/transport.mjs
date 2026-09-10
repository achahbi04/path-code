/**
 * Phase GC1-a — WorkstationTransport contract.
 *
 * Implementations:
 * - MockWorkstationTransport (canonical / $0)
 * - GcpWorkstationTransport (operator live smoke only)
 *
 * This module is documentation + shared helpers only — no network, no GCP.
 */

/**
 * @typedef {"STATE_UNSPECIFIED"|"CREATING"|"STATE_STARTING"|"STATE_RUNNING"|"STATE_STOPPING"|"STATE_STOPPED"|"DELETED"|"ERROR"} WorkstationState
 *
 * @typedef {object} WorkstationRecord
 * @property {string} name
 * @property {string} workstationId
 * @property {WorkstationState} state
 * @property {string} [configName]
 *
 * @typedef {object} ClusterRecord
 * @property {string} name
 * @property {string} clusterId
 * @property {string} state
 *
 * @typedef {object} ConfigRecord
 * @property {string} name
 * @property {string} configId
 * @property {object} body
 *
 * @typedef {object} ExecuteResult
 * @property {string} stdout
 * @property {string} stderr
 * @property {number} exitCode
 *
 * @typedef {object} WorkstationTransport
 * @property {(id: string, body?: object) => Promise<ClusterRecord>} createCluster
 * @property {(name: string) => Promise<ClusterRecord|null>} getCluster
 * @property {(parent: string) => Promise<ClusterRecord[]>} listClusters
 * @property {(name: string) => Promise<void>} deleteCluster
 * @property {(parent: string, id: string, body: object) => Promise<ConfigRecord>} createConfig
 * @property {(name: string) => Promise<ConfigRecord|null>} getConfig
 * @property {(parent: string) => Promise<ConfigRecord[]>} listConfigs
 * @property {(name: string) => Promise<void>} deleteConfig
 * @property {(parent: string, id: string, body?: object) => Promise<WorkstationRecord>} createWorkstation
 * @property {(name: string) => Promise<WorkstationRecord|null>} getWorkstation
 * @property {(parent: string) => Promise<WorkstationRecord[]>} listWorkstations
 * @property {(name: string) => Promise<WorkstationRecord>} startWorkstation
 * @property {(name: string) => Promise<WorkstationRecord>} stopWorkstation
 * @property {(name: string) => Promise<void>} deleteWorkstation
 * @property {(opts: { workstationName: string, command: string }) => Promise<ExecuteResult>} executeCommand
 * @property {() => object} [getDebugStats]
 */

export {};
