// to generate a unique id for each process (import the library from nodejs)
const { randomUUID } = require("crypto");

// encodes a process
class Process {
  constructor(name, burstTime) {
    this.id = randomUUID();
    this.name = name;
    this.burstTime = burstTime;
    this.remainingTime = burstTime;
  }
}

class ExecutionEntry {
  constructor(entryTime, process) {
    this.process = process;
    this.entryTime = entryTime;
    this.executionTimes = [];
  }
}

/*
P1 0-2 4-6
P2 2-4 6-8

      P1           P2          P1          P2
---------------------------------------------------------------
0		1		2		3		4		5		6		7		8 		9		10
*/
class ShortestRemainingTimeFirstScheduler {
  constructor(options) {
    this.executionEntry = {};
    this.processes = [];
    this.timeSlice = options?.timeSlice ?? 2;
    this.verbose = options?.verbose ?? 0;

    // tells us if the scheduler is in an idle state
    this.waitState = false;

    this.notifyFunc = null;
    this.clockTime = 0;
    this.closed = false;
    this.events = {};
    this.executionControl = null;
    this.executionControlId = null;
    this.currentProcess = null;
    this.currentProcessStartTime = null;

    if (options?.waitIdle) {
      process.stdin.on("data", () => {});
    }
  }

  on(event, callback) {
    this.events[event] = callback;
  }
  log(info, priority) {
    if (this.verbose > priority) {
      console.log(info);
    }
  }
  static log(process, type) {
    switch (type) {
      case "done":
        return `Done executing ${process.name}`;
      default:
        return `Executing ${process.name} with ${process.remainingTime}s left`;
    }
  }
  async start() {
    if (this.closed) {
      throw new Error("Scheduler is closed");
    }

    // updates the scheduler's clocktime
    this.clockTimeIntervalId = setInterval(() => {
      this.clockTime += 0.5;
    }, 498);

    while (true) {
      let currentProcess = this.getNextProcess();
      this.currentProcess = currentProcess;
      if (!currentProcess) {
        this.log("scheduler entering idle state", 0);

        // tells the scheduler to wait till we have a new process to work on
        await this.waitIdle();
        currentProcess = this.getNextProcess();
        this.currentProcess = currentProcess;
      }

      // checks if we still need to work on a process
      if (!currentProcess.remainingTime) {
        this.processes = this.processes.filter(
          (process) => process.id !== currentProcess.id
        );
        continue;
      }

      // Where we start executing each process
      // 1-3 [1, 3]
      const entry = [this.clockTime, 0];

      this.currentProcessStartTime = this.clockTime;
      const executedTime = await this.execute(currentProcess);

      // updating the process execution entry after work is done on it
      entry[1] = this.clockTime;

      // we store this particular entry with others of the same process

      this.executionEntry[currentProcess.id].executionTimes.push(entry);
      currentProcess.remainingTime -= executedTime;

      // to perform some reset operations
      this.currentProcess = null;
      this.executionControl = null;
      this.executionControlId = null;
      this.currentProcessStartTime = null;
    }
  }

  // gets the process with the shortest remaining time left
  getNextProcess() {
    let min = null;
    for (const process of this.processes) {
      if (!min) {
        min = process;
      } else if (min.remainingTime > process.remainingTime) {
        min = process;
      }
    }
    return min;
  }

  // pauses the scheduler to till a new process is added to the system
  async waitIdle() {
    this.waitState = true;
    return new Promise((resolve) => {
      this.notifyFunc = resolve;
    });
  }

  // adds a new process to the scheduler
  add(process) {
    if (this.closed) {
      throw new Error("Scheduler is closed");
    }

    this.log(`Adding ${process.name} with ${process.burstTime}s burst time`, 0);

    // creates a new execution entry for the process
    this.executionEntry[process.id] = new ExecutionEntry(
      this.clockTime,
      process
    );

    // adds the new process to list of processes the scheduler keeps
    this.processes.push(process);

    if (this.waitState && this.notifyFunc instanceof Function) {
      // this basically wakes up the scheduler
      this.notifyFunc();
      this.waitState = false;
      this.notifyFunc = null;
    }

    /*
		P1 3 0, P2 1 0, P3 4 0, P4 1 2

		P1 1-2 3-5
		P2 0-1
		P3 5-9
		P4 2-3

		*/

    /*
		if there is a current process being worked on we need to check if it would be a better decision to continue
		working on it or switch to the newly added process.
		*/
    if (this.currentProcess) {
      let currentProcessTimeLeft = this.currentProcess.remainingTime;
      currentProcessTimeLeft -= this.clockTime - this.currentProcessStartTime;

      if (process.burstTime < currentProcessTimeLeft) {
        clearTimeout(this.executionControlId);
        this.executionControl(this.clockTime - this.currentProcessStartTime);
      }
    }
  }

  // simulates work on a process
  async execute(process) {
    const timeSlice = process.remainingTime;
    return new Promise((resolve) => {
      // storing the resolve function of the promise globally so we can use it bo break out of the execution
      this.executionControl = resolve;
      this.executionControlId = setTimeout(
        () => resolve(timeSlice),
        timeSlice * 1000
      );
    });
  }

  end() {
    if (this.waitState) {
      this.closed = true;
      clearInterval(this.clockTimeIntervalId);
      process.stdin.pause();
    } else {
      throw new Error("Some processes are still executing");
    }
  }

  printExecutionStat() {
    console.log(
      "\n===================== Processes Stat ======================="
    );
    const waitTimes = [];
    const serviceTimes = [];
    Object.values(this.executionEntry).forEach((processExecuteEntry) => {
      const startTime = processExecuteEntry.entryTime;
      const entries = processExecuteEntry.executionTimes;
      // 4-5
      // [4, 5]
      const process = processExecuteEntry.process;
      const waitTime = entries.reduce(
        (total, currentEntry) => {
          return [total[0] + currentEntry[0] - total[1], currentEntry[1]];
        },
        [0, startTime]
      )[0];

      /*
			start time = 0

			first entry = [4, 5]
			first wait time = 4-0

			second entry = [7, 9]
			start of second entry - end of first entry
			second wait time = 7- 5

			total wait time = first wait time + second wait time (4 + 2 = 6)
			*/

      const serviceTime = waitTime + process.burstTime;

      waitTimes.push(waitTime);
      serviceTimes.push(serviceTime);
      console.log(`-> Process ${process.name}`);
      console.log(`Burst Time: ${process.burstTime}`);
      console.log(`Start Time: ${startTime}`);
      console.log(
        `Execution Times: ${entries
          .map(([start, end]) => `${start}-${end}`)
          .join(", ")}`
      );
      console.log(`Wait Time: ${waitTime}s`);
      console.log(`Service Time: ${serviceTime}s`);
      console.log("");
    });
    console.log("===");

    /*
		waiting time for all processes = [3, 3, 9, 9, 2]
		3 + 3 + 9 + 9 + 2
		------------------
				5
		*/
    console.log(
      `Average Waiting Time: ${
        waitTimes.reduce((t, c) => t + c, 0) / waitTimes.length
      }s`
    );
    console.log(
      `Average Service Time: ${
        serviceTimes.reduce((t, c) => t + c, 0) / serviceTimes.length
      }s`
    );
    console.log("===");
  }
}

const scheduler = new ShortestRemainingTimeFirstScheduler({
  timeSlice: 2,
  verbose: 6,
  waitIdle: false,
});
scheduler.add(new Process("P1", 4));
scheduler.add(new Process("P2", 3));
scheduler.add(new Process("P3", 5));

scheduler.start();

// wrapping the scheduler.add method in a setTimeout to simulate adding a process
// at a time other than time 0
setTimeout(() => {
  scheduler.add(new Process("P4", 1));
}, 1000);

setTimeout(() => {
  scheduler.add(new Process("P5", 1));
}, 5000);

process.stdin.on("data", (chunk) => {
  const input = chunk.toString().trim().split(" ");
  switch (input[0].toLowerCase()) {
    case "start":
      scheduler.start();
      break;
    case "stat":
      scheduler.printExecutionStat();
      break;
    case "clear":
      console.clear();
      break;
    case "add":
      scheduler.add(new Process(input[1], +input[2]));
      break;
    case "processes":
      for (const process of scheduler.processes) {
        console.log(
          `Process ${process.name} remains ${process.remainingTime}s`
        );
      }
      break;
    case "close":
      process.exit(0);
    default:
      console.log("Invalid command");
  }
});

/*

	1. install node js version 18
	2. run `node shortest.js`
	3. wait till you receive `scheduler entering idle state`
	4. run stat to see the results

*/
