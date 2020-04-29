# Linux的进程间通信-信号量

-------------------------------------------------------------------------------------

版权声明：

本文章内容在非商业使用前提下可无需授权任意转载、发布。

转载、发布请务必注明作者和其微博、微信公众号地址，以便读者询问问题和甄误反馈，共同进步。

微博：
[https://weibo.com/orroz/](https://weibo.com/orroz)

博客：
[https://zorrozou.github.io/](https://zorrozou.github.io/)

微信公众号：**Linux系统技术**

-------------------------------------------------------------------------------------

## 前言

信号量又叫信号灯，也有人把它叫做信号集，本文遵循《UNIX环境高级编程》的叫法，仍称其为信号量。它的英文是semaphores，本意是“旗语”“信号”的意思。由于其叫法中包含“信号”这个关键字，所以容易跟另一个信号signal搞混。在这里首先强调一下，Linux系统中的semaphore信号量和signal信号是完全不同的两个概念。我们将在其它文章中详细讲解信号signal。本文可以帮你学会：

1. 什么是XSI信号量？
2. 什么是PV操作及其应用。
3. 什么是POSIX信号量？
4. 信号量的操作方法及其实现。

我们已经知道文件锁对于多进程共享文件的必要性了，对一个文件加锁，可以防止多进程访问文件时的“竞争条件”。信号量提供了类似能力，可以处理不同状态下多进程甚至多线程对共享资源的竞争。它所起到的作用就像十字路口的信号灯或航船时的旗语，用来协调多个执行过程对临界区的访问。但是从本质上讲，信号量实际上是实现了一套可以实现类似锁功能的原语，我们不仅可以用它实现锁，还可以实现其它行为，比如经典的PV操作。

Linux环境下主要实现的信号量有两种。根据标准的不同，它们跟共享内存类似，一套XSI的信号量，一套POSIX的信号量。下面我们分别使用它们实现一套类似文件锁的方法，来简单看看它们的使用。

## XSI信号量

XSI信号量就是内核实现的一个计数器，可以对计数器做甲减操作，并且操作时遵守一些基本操作原则，即：对计数器做加操作立即返回，做减操作要检查计数器当前值是否够减？（减被减数之后是否小于0）如果够，则减操作不会被阻塞；如果不够，则阻塞等待到够减为止。在此先给出其相关操作方法的原型：

	#include <sys/sem.h>
	
	int semget(key_t key, int nsems, int semflg);

可以使用semget创建或者打开一个已经创建的信号量数组。根据XSI共享内存中的讲解，我们应该已经知道第一个参数key用来标识系统内的信号量。这里除了可以使用ftok产生以外，还可以使用IPC_PRIVATE创建一个没有key的信号量。如果指定的key已经存在，则意味着打开这个信号量，这时nsems参数指定为0，semflg参数也指定为0。nsems参数表示在创建信号量数组的时候，这个数组中的信号量个数是几个。我们可以通过多个信号量的数组实现更复杂的信号量功能。最后一个semflg参数用来指定标志位，主要有：IPC_CREAT，IPC_EXCL和权限mode。

	#include <sys/types.h>
	#include <sys/ipc.h>
	#include <sys/sem.h>
	
	int semop(int semid, struct sembuf *sops, size_t nsops);

	int semtimedop(int semid, struct sembuf *sops, size_t nsops, const struct timespec *timeout);

使用semop调用来对信号量数组进行操作。nsops指定对数组中的几个元素进行操作，如数组中只有一个信号量就指定为1。操作的所有参数都定义在一个sembuf结构体里，其内容如下：

	unsigned short sem_num;  /* semaphore number */
	short          sem_op;   /* semaphore operation */
	short          sem_flg;  /* operation flags */

sem_flg可以指定的参数包括IPC_NOWAIT和SEM_UNDO。当制定了SEM_UNDO，进程退出的时候会自动UNDO它对信号量的操作。对信号量的操作会作用在指定的第sem_num个信号量。一个信号量集合中的第1个信号量的编号从0开始。所以，对于只有一个信号量的信号集，这个sem_num应指定为0。sem_op用来指定对信号量的操作，可以有的操作有三种：

正值操作：对信号量计数器的值（semval）进行加操作。

0值操作：对计数器的值没有影响，而且要求对进程对信号量必须有读权限。实际上这个行为是一个“等待计数器为0”的操作：如果计数器的值为0，则操作可以立即返回。如果不是0并且sem_flg被设置为IPC_NOWAIT的情况下，0值操作也不会阻塞，而是会立即返回，并且errno被设置为EAGAIN。如果不是0，且没设置IPC_NOWAIT时，操作会阻塞，直到计数器值变成0为止，此时相关信号量的semncnt值会加1，这个值用来记录有多少个进程（线程）在此信号量上等待。除了计数器变为0会导致阻塞停止以外，还有其他情况也会导致停止等待：信号量被删除，semop操作会失败，并且errno被置为EIDRM。进程被信号（signal）打断，errno会被置为EINTR，切semzcnt会被正常做减处理。

负值操作：对计数器做减操作，且进程对信号量必须有写权限。如果当前计数器的值大于或等于指定负值的绝对值，则semop可以立即返回，并且计数器的值会被置为减操作的结果。如果sem_op的绝对值大于计数器的值semval，则说明目前不够减，测试如果sem_flg设置了IPC_NOWAIT，semop操作依然会立即返回并且errno被置为EAGAIN。如果没设置IPC_NOWAIT，则会阻塞，直到以下几种情况发生为止：

1. semval的值大于或等于sem_op的绝对值，这时表示有足够的值做减法了。
2. 信号量被删除，semop返回EIDRM。
3. 进程（线程）被信号打断，semop返回EINTR。

这些行为基本与0值操作类似。semtimedop提供了一个带超时机制的结构，以便实现等待超时。观察semop的行为我们会发现，有必要在一个信号量创建之后对其默认的计数器semval进行赋值。所以，我们需要在semop之前，使用semctl进行赋值操作。
	
	int semctl(int semid, int semnum, int cmd, ...);

这个调用是一个可变参实现，具体参数要根据cmd的不同而变化。在一般的使用中，我们主要要学会使用它改变semval的值和查看、修改sem的属性。相关的cmd为：SETVAL、IPC_RMID、IPC_STAT。

一个简单的修改semval的例子：

	semctl(semid, 0, SETVAL, 1)；

这个调用可以将指定的sem的semval值设置为1。更具体的参数解释大家可以参考man 2 semctl。

以上就是信号量定义的原语意义。如果用它实现类似互斥锁的操作，那么我们就可以初始化一个默认计数器值为1的的信号量，当有人进行加锁操作的时候对其减1，解锁操作对其加1。于是对于一个已经被减1的信号量计数器来说，再有人加锁会导致阻塞等待，直到加锁的人解锁后才能再被别人加锁。


我们结合例子来看一下它们的使用，我们用sem实现一套互斥锁，这套锁除了可以锁文件，也可以用来给共享内存加锁，我们可以用它来保护上面共享内存使用的时的临界区。我们使用xsi共享内存的代码案例为例子：

	[zorro@zorro-pc sem]$ cat racing_xsi_shm.c
	#include <unistd.h>
	#include <stdlib.h>
	#include <stdio.h>
	#include <errno.h>
	#include <fcntl.h>
	#include <string.h>
	#include <sys/file.h>
	#include <wait.h>
	#include <sys/mman.h>
	#include <sys/ipc.h>
	#include <sys/shm.h>
	#include <sys/types.h>
	#include <sys/sem.h>
	
	#define COUNT 100
	#define PATHNAME "/etc/passwd"
	
	static int lockid;
	
	int mylock_init(void)
	{
	    int semid;
	
	    semid = semget(IPC_PRIVATE, 1, IPC_CREAT|0600);
	    if (semid < 0) {
	        perror("semget()");
	        return -1;
	    }
	    if (semctl(semid, 0, SETVAL, 1) < 0) {
	        perror("semctl()");
	        return -1;
	    }
	    return semid;
	}
	
	void mylock_destroy(int lockid)
	{
	    semctl(lockid, 0, IPC_RMID);
	}
	
	int mylock(int lockid)
	{
	    struct sembuf sbuf;
	
	    sbuf.sem_num = 0;
	    sbuf.sem_op = -1;
	    sbuf.sem_flg = 0;
	
	    while (semop(lockid, &sbuf, 1) < 0) {
	        if (errno == EINTR) {
	
	            continue;
	        }
	        perror("semop()");
	        return -1;
	    }
	
	    return 0;
	}
	
	int myunlock(int lockid)
	{
	    struct sembuf sbuf;
	
	    sbuf.sem_num = 0;
	    sbuf.sem_op = 1;
	    sbuf.sem_flg = 0;
	
	    if (semop(lockid, &sbuf, 1) < 0) {
	        perror("semop()");
	        return -1;
	    }
	
	    return 0;
	}
	
	int do_child(int proj_id)
	{
		int interval;
		int *shm_p, shm_id;
		key_t shm_key;
	
		if ((shm_key = ftok(PATHNAME, proj_id)) == -1) {
			perror("ftok()");
			exit(1);
		}
	
		shm_id = shmget(shm_key, sizeof(int), 0);
		if (shm_id < 0) {
			perror("shmget()");
			exit(1);
		}
	
		shm_p = (int *)shmat(shm_id, NULL, 0);
		if ((void *)shm_p == (void *)-1) {
			perror("shmat()");
			exit(1);
		}
	
		/* critical section */
		if (mylock(lockid) == -1) {
			exit(1);
		}
		interval = *shm_p;
		interval++;
		usleep(1);
		*shm_p = interval;
		if (myunlock(lockid) == -1) {
			exit(1);
		}
		/* critical section */
	
		if (shmdt(shm_p) < 0) {
			perror("shmdt()");
			exit(1);
		}
	
		exit(0);
	}
	
	int main()
	{
		pid_t pid;
		int count;
		int *shm_p;
		int shm_id, proj_id;
		key_t shm_key;
	
		lockid = mylock_init();
		if (lockid == -1) {
			exit(1);
		}
	
		proj_id = 1234;
		if ((shm_key = ftok(PATHNAME, proj_id)) == -1) {
			perror("ftok()");
			exit(1);
		}
	
		shm_id = shmget(shm_key, sizeof(int), IPC_CREAT|IPC_EXCL|0600);
		if (shm_id < 0) {
			perror("shmget()");
			exit(1);
		}
	
		shm_p = (int *)shmat(shm_id, NULL, 0);
		if ((void *)shm_p == (void *)-1) {
			perror("shmat()");
			exit(1);
		}
	
		*shm_p = 0;
	
		for (count=0;count<COUNT;count++) {
			pid = fork();
			if (pid < 0) {
				perror("fork()");
				exit(1);
			}
	
			if (pid == 0) {
				do_child(proj_id);
			}
		}
	
		for (count=0;count<COUNT;count++) {
			wait(NULL);
		}
	
		printf("shm_p: %d\n", *shm_p);
	
		if (shmdt(shm_p) < 0) {
			perror("shmdt()");
			exit(1);
		}
	
		if (shmctl(shm_id, IPC_RMID, NULL) < 0) {
			perror("shmctl()");
			exit(1);
		}
	
		mylock_destroy(lockid);
	
		exit(0);
	}

此时可以得到正确的执行结果：

	[zorro@zorro-pc sem]$ ./racing_xsi_shm 
	shm_p: 100

大家可以自己思考一下，如何使用信号量来完善这个所有的锁的操作行为，并补充以下方法：

1. 实现trylock。
2. 实现共享锁。
3. 在共享锁的情况下，实现查看当前有多少人以共享方式加了同一把锁。

系统中对于XSI信号量的限制都放在一个文件中，路径为：/proc/sys/kernel/sem。文件中包涵4个限制值，它们分别的含义是：

SEMMSL：一个信号量集（semaphore set）中，最多可以有多少个信号量。这个限制实际上就是semget调用的第二个参数的个数上限。

SEMMNS：系统中在所有信号量集中最多可以有多少个信号量。

SEMOPM：可以使用semop系统调用指定的操作数限制。这个实际上是semop调用中，第二个参数的结构体中的sem_op的数字上限。

SEMMNI：系统中信号量的id标示数限制。就是信号量集的个数上限。


##PV操作原语

PV操作是操作系统原理中的重点内容之一，而根据上述的互斥锁功能的描述来看，实际上我们的互斥锁就是一个典型的PV操作。加锁行为就是P操作，解锁就是V操作。PV操作是计算机操作系统需要提供的基本功能之一。最开始它用来在只有1个CPU的计算机系统上实现多任务操作系统的功能原语。试想，多任务操作系统意味着系统中同时可以执行多个进程，但是CPU只有一个，那就意味着某一个时刻实际上只能有一个进程占用CPU，而其它进程此时都要等着。基于这个考虑，1962年狄克斯特拉在THE系统中提出了PV操作原语的设计，来实现多进程占用CPU资源的控制原语。在理解了互斥锁之后，我们能够意识到，临界区代码段实际上跟多进程使用一个CPU的环境类似，它们都是对竞争条件下的有限资源。对待这样的资源，就有必要使用PV操作原语进行控制。

根据这个思路，我们再扩展来看一个应用。我们都知道现在的计算机基本都是多核甚至多CPU的场景，所以很多计算任务如果可以并发执行，那么无疑可以增加计算能力。假设我们使用多进程的方式进行并发运算，那么并发多少个进程合适呢？虽然说这个问题会根据不同的应用场景发生变化，但是如果假定是一个极度消耗CPU的运算的话，那么无疑有几个CPU就应该并发几个进程。此时并发个数如果过多，则会增加调度开销导致整体吞度量下降，而过少则无法利用多个CPU核心。PV操作正好是一种可以实现类似方法的一种编程原语。我们假定一个应用模型，这个应用要找到从10010001到10020000数字范围内的质数。如果采用并发的方式，我们可以考虑给每一个要判断的数字都用一个进程去计算，但是这样无疑会使进程个数远远大于一般计算机的CPU个数。于是我们就可以在产生进程的时候，使用PV操作原语来控制同时进行运算的进程个数。这套PV原语的实现其实跟上面的互斥锁区别不大，对于互斥锁，计数器的初值为1，而对于这个PV操作，无非就是计数器的初值设置为当前计算机的核心个数，具体代码实现如下：

	[zorro@zorro-pc sem]$ cat sem_pv_prime.c
	#include <stdio.h>
	#include <stdlib.h>
	#include <errno.h>
	#include <unistd.h>
	#include <sys/ipc.h>
	#include <sys/sem.h>
	#include <sys/shm.h>
	#include <sys/types.h>
	#include <sys/wait.h>
	#include <signal.h>
	
	#define START 10010001
	#define END 10020000
	#define NPROC 4
	
	static int pvid;
	
	int mysem_init(int n)
	{
	    int semid;
	
	    semid = semget(IPC_PRIVATE, 1, IPC_CREAT|0600);
	    if (semid < 0) {
	        perror("semget()");
	        return -1;
	    }
	    if (semctl(semid, 0, SETVAL, n) < 0) {
	        perror("semctl()");
	        return -1;
	    }
	    return semid;
	}
	
	void mysem_destroy(int pvid)
	{
	    semctl(pvid, 0, IPC_RMID);
	}
	
	int P(int pvid)
	{
	    struct sembuf sbuf;
	
	    sbuf.sem_num = 0;
	    sbuf.sem_op = -1;
	    sbuf.sem_flg = 0;
	
	    while (semop(pvid, &sbuf, 1) < 0) {
	        if (errno == EINTR) {
	            continue;
	        }
	        perror("semop(p)");
	        return -1;
	    }
	
	    return 0;
	}
	
	int V(int pvid)
	{
	    struct sembuf sbuf;
	
	    sbuf.sem_num = 0;
	    sbuf.sem_op = 1;
	    sbuf.sem_flg = 0;
	
	    if (semop(pvid, &sbuf, 1) < 0) {
	        perror("semop(v)");
	        return -1;
	    }
	    return 0;
	}
	
	int prime_proc(int n)
	{
	    int i, j, flag;
	
	    flag = 1;
	    for (i=2;i<n/2;++i) {
	        if (n%i == 0) {
	            flag = 0;
	            break;
	        }
	    }
	    if (flag == 1) {
	        printf("%d is a prime\n", n);
	    }
	    /* 子进程判断完当前数字退出之前进行V操作 */
	    V(pvid);
	    exit(0);
	}
	
	void sig_child(int sig_num)
	{
	    while (waitpid(-1, NULL, WNOHANG) > 0);
	}
	
	int main(void)
	{
	    pid_t pid;
	    int i;
	    
	    /* 当子进程退出的时候使用信号处理进行回收，以防止产生很多僵尸进程 */
	
	    if (signal(SIGCHLD, sig_child) == SIG_ERR) {
	        perror("signal()");
	        exit(1);
	    }
	
	    pvid = mysem_init(NPROC);
	
		/* 每个需要运算的数字都打开一个子进程进行判断 */
	    for (i=START;i<END;i+=2) {
	    	/* 创建子进程的时候进行P操作。 */
	        P(pvid);
	        pid = fork();
	        if (pid < 0) {
	        	/* 如果创建失败则应该V操作 */
	            V(pvid);
	            perror("fork()");
	            exit(1);
	        }
	        if (pid == 0) {
	        	/* 创建子进程进行这个数字的判断 */
	            prime_proc(i);
	        }
	    }
		/* 在此等待所有数都运算完，以防止运算到最后父进程先mysem_destroy，导致最后四个子进程进行V操作时报错 */
		while (1) {sleep(1);};
	    mysem_destroy(pvid);
	    exit(0);
	}

整个进程组的执行逻辑可以描述为，父进程需要运算判断10010001到10020000数字范围内所有出现的质数，采用每算一个数打开一个子进程的方式。为控制同时进行运算的子进程个数不超过CPU个数，所以申请了一个值为CPU个数的信号量计数器，每创建一个子进程，就对计数器做P操作，子进程运算完推出对计数器做V操作。由于P操作在计数器是0的情况下会阻塞，直到有其他子进程退出时使用V操作使计数器加1，所以整个进程组不会产生大于CPU个数的子进程进行任务的运算。

这段代码使用了信号处理的方式回收子进程，以防产生过多的僵尸进程，这种编程方法比较多用在daemon中。使用这个方法引出的问题在于，如果父进程不在退出前等所有子进程回收完毕，那么父进程将在最后几个子进程执行完之前就将信号量删除了，导致最后几个子进程进行V操作的时候会报错。当然，我们可以采用更优雅的方式进程处理，但是那并不是本文要突出讲解的内容，大家可以自行对相关方法进行完善。一般的daemon进程正常情况下父进程不会主动退出，所以不会有类似问题。

##POSIX信号量

POSIX提供了一套新的信号量原语，其原型定义如下：

	#include <fcntl.h> 
	#include <sys/stat.h>
	#include <semaphore.h>
	
	sem_t *sem_open(const char *name, int oflag);
	sem_t *sem_open(const char *name, int oflag, mode_t mode, unsigned int value);

使用sem_open来创建或访问一个已经创建的POSIX信号量。创建时，可以使用value参数对其直接赋值。
	
	int sem_wait(sem_t *sem);
	int sem_trywait(sem_t *sem);
	int sem_timedwait(sem_t *sem, const struct timespec *abs_timeout);

sem_wait会对指定信号量进行减操作，如果信号量原值大于0，则减操作立即返回。如果当前值为0，则sem_wait会阻塞，直到能减为止。
	
	int sem_post(sem_t *sem);

sem_post用来对信号量做加操作。这会导致某个已经使用sem_wait等在这个信号量上的进程返回。
       
	int sem_getvalue(sem_t *sem, int *sval);

sem_getvalue用来返回当前信号量的值到sval指向的内存地址中。如果当前有进程使用sem_wait等待此信号量，POSIX可以允许有两种返回，一种是返回0，另一种是返回一个负值，这个负值的绝对值就是等待进程的个数。Linux默认的实现是返回0。
       
	int sem_unlink(const char *name);

	int sem_close(sem_t *sem);

使用sem_close可以在进程内部关闭一个信号量，sem_unlink可以在系统中删除信号量。

POSIX信号量实现的更清晰简洁，相比之下，XSI信号量更加复杂，但是却更佳灵活，应用场景更加广泛。在XSI信号量中，对计数器的加和减操作都是通过semop方法和一个sembuff的结构体来实现的，但是在POSIX中则给出了更清晰的定义：使用sem_post函数可以增加信号量计数器的值，使用sem_wait可以减少计数器的值。如果计数器的值当前是0，则sem_wait操作会阻塞到值大于0。

POSIX信号量也提供了两种方式的实现，命名信号量和匿名信号量。这有点类似XSI方式使用ftok文件路径创建和IPC_PRIVATE方式创建的区别。但是表现形式不太一样：

命名信号量：

命名信号量实际上就是有一个文件名的信号量。跟POSIX共享内存类似，信号量也会在/dev/shm目录下创建一个文件，如果有这个文件名就是一个命名信号量。其它进程可以通过这个文件名来通过sem_open方法使用这个信号量。除了访问一个命名信号量以外，sem_open方法还可以创建一个信号量。创建之后，就可以使用sem_wait、sem_post等方法进行操作了。这里要注意的是，一个命名信号量在用sem_close关闭之后，还要使用sem_unlink删除其文件名，才算彻底被删除。

匿名信号量：

一个匿名信号量仅仅就是一段内存区，并没有一个文件名与之对应。匿名信号量使用sem_init进行初始化，使用sem_destroy()销毁。操作方法跟命名信号量一样。匿名内存的初始化方法跟sem_open不一样，sem_init要求对一段已有内存进行初始化，而不是在/dev/shm下产生一个文件。这就要求：如果信号量是在一个进程中的多个线程中使用，那么它所在的内存区应该是这些线程应该都能访问到的全局变量或者malloc分配到的内存。如果是在多个进程间共享，那么这段内存应该本身是一段共享内存（使用mmap、shmget或shm_open申请的内存）。

POSIX共享内存所涉及到的其它方法应该也都比较简单，更详细的帮助参考相关的man手册即可，下面我们分别给出使用命名和匿名信号量的两个代码例子：

命名信号量使用：

	[zorro@zorro-pc sem]$ cat racing_posix_shm.c
	#include <unistd.h>
	#include <stdlib.h>
	#include <stdio.h>
	#include <errno.h>
	#include <fcntl.h>
	#include <string.h>
	#include <sys/file.h>
	#include <wait.h>
	#include <sys/mman.h>
	#include <sys/stat.h>
	#include <semaphore.h>
	
	#define COUNT 100
	#define SHMPATH "/shm"
	#define SEMPATH "/sem"
	
	static sem_t *sem;
	
	sem_t *mylock_init(void)
	{
		sem_t * ret;
		ret = sem_open(SEMPATH, O_CREAT|O_EXCL, 0600, 1);
	    if (ret == SEM_FAILED) {
	        perror("sem_open()");
	        return NULL;
	    }
	    return ret;
	}
	
	void mylock_destroy(sem_t *sem)
	{
	    sem_close(sem);
    	sem_unlink(SEMPATH);
	}
	
	int mylock(sem_t *sem)
	{
	    while (sem_wait(sem) < 0) {
	        if (errno == EINTR) {
	            continue;
	        }
	        perror("sem_wait()");
	        return -1;
	    }
	
	    return 0;
	}
	
	int myunlock(sem_t *sem)
	{
	    if (sem_post(sem) < 0) {
	        perror("semop()");
	        return -1;
	    }
	}
	
	int do_child(char * shmpath)
	{
		int interval, shmfd, ret;
		int *shm_p;
	
		shmfd = shm_open(shmpath, O_RDWR, 0600);
		if (shmfd < 0) {
			perror("shm_open()");
			exit(1);
		}
	
		shm_p = (int *)mmap(NULL, sizeof(int), PROT_WRITE|PROT_READ, MAP_SHARED, shmfd, 0);
		if (MAP_FAILED == shm_p) {
			perror("mmap()");
			exit(1);
		}
		/* critical section */
		mylock(sem);
		interval = *shm_p;
		interval++;
		usleep(1);
		*shm_p = interval;
		myunlock(sem);
		/* critical section */
		munmap(shm_p, sizeof(int));
		close(shmfd);
	
		exit(0);
	}
	
	int main()
	{
		pid_t pid;
		int count, shmfd, ret;
		int *shm_p;
	
		sem = mylock_init();
		if (sem == NULL) {
			fprintf(stderr, "mylock_init(): error!\n");
			exit(1);
		}
	
		shmfd = shm_open(SHMPATH, O_RDWR|O_CREAT|O_TRUNC, 0600);
		if (shmfd < 0) {
			perror("shm_open()");
			exit(1);
		}
	
		ret = ftruncate(shmfd, sizeof(int));
		if (ret < 0) {
			perror("ftruncate()");
			exit(1);
		}
	
		shm_p = (int *)mmap(NULL, sizeof(int), PROT_WRITE|PROT_READ, MAP_SHARED, shmfd, 0);
		if (MAP_FAILED == shm_p) {
			perror("mmap()");
			exit(1);
		}
	
		*shm_p = 0;
	
		for (count=0;count<COUNT;count++) {
			pid = fork();
			if (pid < 0) {
				perror("fork()");
				exit(1);
			}
	
			if (pid == 0) {
				do_child(SHMPATH);
			}
		}
	
		for (count=0;count<COUNT;count++) {
			wait(NULL);
		}
	
		printf("shm_p: %d\n", *shm_p);
		munmap(shm_p, sizeof(int));
		close(shmfd);
		shm_unlink(SHMPATH);
		sleep(3000);
		mylock_destroy(sem);
		exit(0);
	}

匿名信号量使用：

	[zorro@zorro-pc sem]$ cat racing_posix_shm_unname.c
	#include <unistd.h>
	#include <stdlib.h>
	#include <stdio.h>
	#include <errno.h>
	#include <fcntl.h>
	#include <string.h>
	#include <sys/file.h>
	#include <wait.h>
	#include <sys/mman.h>
	#include <sys/stat.h>
	#include <semaphore.h>
	
	#define COUNT 100
	#define SHMPATH "/shm"
		
	static sem_t *sem;
	
	void mylock_init(void)
	{
		sem_init(sem, 1, 1);
	}
	
	void mylock_destroy(sem_t *sem)
	{
	    sem_destroy(sem);
	}
	
	int mylock(sem_t *sem)
	{
	    while (sem_wait(sem) < 0) {
	        if (errno == EINTR) {
	            continue;
	        }
	        perror("sem_wait()");
	        return -1;
	    }
	
	    return 0;
	}
	
	int myunlock(sem_t *sem)
	{
	    if (sem_post(sem) < 0) {
	        perror("semop()");
	        return -1;
	    }
	}
	
	int do_child(char * shmpath)
	{
		int interval, shmfd, ret;
		int *shm_p;
	
		shmfd = shm_open(shmpath, O_RDWR, 0600);
		if (shmfd < 0) {
			perror("shm_open()");
			exit(1);
		}
	
		shm_p = (int *)mmap(NULL, sizeof(int), PROT_WRITE|PROT_READ, MAP_SHARED, shmfd, 0);
		if (MAP_FAILED == shm_p) {
			perror("mmap()");
			exit(1);
		}
		/* critical section */
		mylock(sem);
		interval = *shm_p;
		interval++;
		usleep(1);
		*shm_p = interval;
		myunlock(sem);
		/* critical section */
		munmap(shm_p, sizeof(int));
		close(shmfd);
	
		exit(0);
	}
	
	int main()
	{
		pid_t pid;
		int count, shmfd, ret;
		int *shm_p;
	
		sem = (sem_t *)mmap(NULL, sizeof(sem_t), PROT_WRITE|PROT_READ, MAP_SHARED|MAP_ANONYMOUS, -1, 0);
		if ((void *)sem == MAP_FAILED) {
			perror("mmap()");
			exit(1);
		}
	
		mylock_init();
	
		shmfd = shm_open(SHMPATH, O_RDWR|O_CREAT|O_TRUNC, 0600);
		if (shmfd < 0) {
			perror("shm_open()");
			exit(1);
		}
	
		ret = ftruncate(shmfd, sizeof(int));
		if (ret < 0) {
			perror("ftruncate()");
			exit(1);
		}
	
		shm_p = (int *)mmap(NULL, sizeof(int), PROT_WRITE|PROT_READ, MAP_SHARED, shmfd, 0);
		if (MAP_FAILED == shm_p) {
			perror("mmap()");
			exit(1);
		}
	
		*shm_p = 0;
	
		for (count=0;count<COUNT;count++) {
			pid = fork();
			if (pid < 0) {
				perror("fork()");
				exit(1);
			}
	
			if (pid == 0) {
				do_child(SHMPATH);
			}
		}
	
		for (count=0;count<COUNT;count++) {
			wait(NULL);
		}
	
		printf("shm_p: %d\n", *shm_p);
		munmap(shm_p, sizeof(int));
		close(shmfd);
		shm_unlink(SHMPATH);
		sleep(3000);
		mylock_destroy(sem);
		exit(0);
	}
	
以上程序没有仔细考究，只是简单列出了用法。另外要注意的是，这些程序在编译的时候需要加额外的编译参数-lrt和-lpthread。

##最后


希望这些内容对大家进一步深入了解Linux的信号量。如果有相关问题，可以在我的微博、微信或者博客上联系我。


----------------------------------

大家好，我是Zorro！

如果你喜欢本文，欢迎在微博上搜索“**orroz**”关注我，地址是：
[https://weibo.com/orroz](https://weibo.com/orroz)

大家也可以在微信上搜索：**Linux系统技术** 关注我的公众号。

我的所有文章都会沉淀在我的个人博客上，地址是：
[https://zorrozou.github.io/](https://zorrozou.github.io/)。

欢迎使用以上各种方式一起探讨学习，共同进步。

公众号二维码：

![Zorro］ icon](http://ww1.sinaimg.cn/mw690/6673053fgw1f31zfw1dprj20by0by0tc.jpg)

----------------------------------

