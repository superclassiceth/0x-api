import { logUtils as log } from '@0x/utils';
import { ChildProcessWithoutNullStreams, exec, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as rimraf from 'rimraf';
import { promisify } from 'util';

const apiRootDir = path.normalize(path.resolve(`${__dirname}/../../../`));
const execAsync = promisify(exec);
const rimrafAsync = promisify(rimraf);

let yarnStartProcess: ChildProcessWithoutNullStreams;

export enum LogType {
    Hidden,
    Console,
    File,
}

/**
 * The configuration object that provides information on how verbose the logs
 * should be and where they should be located.
 * @param apiLogType The location where the API logs should be logged.
 * @param dependencyLogType The location where the API's dependency logs should be logged.
 */
export interface LoggingConfig {
    apiLogType: LogType;
    dependencyLogType: LogType;
}

/**
 * Sets up a 0x-api instance.
 * @param logConfig Whether or not the logs from the setup functions should
 *        be printed.
 */
export async function setupApiAsync(
    logConfig: LoggingConfig = { apiLogType: LogType.Hidden, dependencyLogType: LogType.Hidden },
): Promise<void> {
    if (yarnStartProcess) {
        throw new Error('Old 0x-api instance has not been torn down');
    }
    await setupDependenciesAsync(logConfig.dependencyLogType);
    yarnStartProcess = spawn('yarn', ['start'], {
        cwd: apiRootDir,
    });
    if (logConfig.apiLogType === LogType.Console) {
        yarnStartProcess.stdout.on('data', chunk => {
            neatlyPrintChunk('[0x-api]', chunk);
        });
        yarnStartProcess.stderr.on('data', chunk => {
            neatlyPrintChunk('[0x-api | error]', chunk);
        });
    } else if (logConfig.apiLogType === LogType.File) {
        const logStream = fs.createWriteStream(`${apiRootDir}/api_logs`, { flags: 'a' });
        const errorStream = fs.createWriteStream(`${apiRootDir}/api_errors`, { flags: 'a' });
        yarnStartProcess.stdout.pipe(logStream);
        yarnStartProcess.stderr.pipe(errorStream);
    }
    // Wait for the API to boot up
    await waitForPatternsAsync(yarnStartProcess, 'api setup: Did not find the API startup log', [
        /API (HTTP) listening on port 3000!/,
    ]);
}

/**
 * Tears down the old 0x-api instance.
 * @param logConfig Whether or not the logs from the teardown functions should
 *        be printed.
 */
export async function teardownApiAsync(): Promise<void> {
    if (!yarnStartProcess) {
        throw new Error('There is no 0x-api instance to tear down');
    }
    yarnStartProcess.kill();
    await teardownDependenciesAsync();
    await rimrafAsync(`${apiRootDir}/0x_mesh`);
}

/**
 * Sets up 0x-api's dependencies.
 * @param shouldPrintLogs Whether or not the logs from `docker-compose up`
 *        should be printed.
 */
export async function setupDependenciesAsync(logType: LogType = LogType.Hidden): Promise<void> {
    const up = spawn('docker-compose', ['up'], {
        cwd: apiRootDir,
        env: {
            ...process.env,
            ETHEREUM_RPC_URL: 'http://ganache:8545',
            ETHEREUM_CHAIN_ID: '1337',
        },
    });
    if (logType === LogType.Console) {
        up.stdout.on('data', chunk => {
            neatlyPrintChunk('[docker-compose up]', chunk);
        });
        up.stderr.on('data', chunk => {
            neatlyPrintChunk('[docker-compose up | error]', chunk);
        });
    } else if (logType === LogType.File) {
        const logStream = fs.createWriteStream(`${apiRootDir}/dependency_logs`, { flags: 'a' });
        const errorStream = fs.createWriteStream(`${apiRootDir}/dependency_errors`, { flags: 'a' });
        up.stdout.pipe(logStream);
        up.stderr.pipe(errorStream);
    }
    // Wait for the dependencies to boot up.
    await waitForPatternsAsync(
        up,
        'dependency setup: Did not find the dependency startup logs',
        [
            /.*mesh.*started HTTP RPC server/,
            /.*mesh.*started WS RPC server/,
            /.*postgres.*database system is ready to accept connections/,
        ],
        25000, // tslint:disable-line:custom-no-magic-numbers
    );
}

/**
 * Tears down 0x-api's dependencies.
 * @param shouldPrintLogs Whether or not the logs from `docker-compose down`
 *        should be printed.
 */
export async function teardownDependenciesAsync(): Promise<void> {
    await execAsync(`cd ${apiRootDir} && docker-compose down && cd -`);
    await rimrafAsync(`${apiRootDir}/postgres`);
}

function neatlyPrintChunk(prefix: string, chunk: Buffer): void {
    const data = chunk.toString().split('\n');
    data.filter((datum: string) => datum !== '').map((datum: string) => {
        log.log(prefix, datum.trim());
    });
}

async function waitForPatternsAsync(
    logStream: ChildProcessWithoutNullStreams,
    errorMessage: string,
    patterns: RegExp[],
    timeout: number = 10000,
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        let patterns_ = patterns;
        logStream.stdout.on('data', chunk => {
            const data = chunk.toString().split('\n');
            for (const datum of data) {
                let i = 0;
                while (i < patterns_.length) {
                    if (patterns_[i].test(datum)) {
                        patterns_ = patterns_.splice(i, i);
                    } else {
                        i++;
                    }
                }
            }
            if (!patterns_.length) {
                resolve();
            }
        });
        setTimeout(() => {
            reject(new Error(errorMessage));
        }, timeout);
    });
}
