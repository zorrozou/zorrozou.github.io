# Linux的进程间通信-消息队列

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

Linux系统给我们提供了一种可以发送格式化数据流的通信手段，这就是消息队列。使用消息队列无疑在某些场景的应用下可以大大减少工作量，相同的工作如果使用共享内存，除了需要自己手工构造一个可能不够高效的队列外，我们还要自己处理竞争条件和临界区代码。而内核给我们提供的消息队列，无疑大大方便了我们的工作。

Linux环境提供了XSI和POSIX两套消息队列，本文将帮助您掌握以下内容：

1. 如何使用XSI消息队列。
2. 如何使用POSIX消息队列。
3. 它们的底层实现分别是什么样子的？
4. 它们分别有什么特点？以及相关资源限制。

## XSI消息队列

系统提供了四个方法来操作XSI消息队列，它们分别是：

	#include <sys/types.h>
	#include <sys/ipc.h>
	#include <sys/msg.h>
		
	int msgget(key_t key, int msgflg);
	
	int msgsnd(int msqid, const void *msgp, size_t msgsz, int msgflg);
	
	ssize_t msgrcv(int msqid, void *msgp, size_t msgsz, long msgtyp, int msgflg);
	
	int msgctl(int msqid, int cmd, struct msqid_ds *buf);

我们可以使用msgget去创建或访问一个消息队列，与其他XSI IPC一样，msgget使用一个key作为创建消息队列的标识。这个key可以通过ftok生成或者指定为IPC_PRIVATE。指定为IPC_PRIVATE时，此队列会新建出来，而且内核会保证新建的队列key不会与已经存在的队列冲突，所以此时后面的msgflag应指定为IPC_CREAT。当msgflag指定为IPC_CREAT时，msgget会去试图创建一个新的消息队列，除非指定key的消息队列已经存在。可以使用O_CREAT | O_EXCL在指定key已经存在的情况下报错，而不是访问这个消息队列。我们来看创建一个消息队列的例子：

	[zorro@zorro-pc mqueue]$ cat msg_create.c
	#include <sys/types.h>
	#include <sys/ipc.h>
	#include <sys/msg.h>
	#include <stdlib.h>
	#include <stdio.h>
	
	#define FILEPATH "/etc/passwd"
	#define PROJID 1234
	
	int main()
	{
		int msgid;
		key_t key;
		struct msqid_ds msg_buf;
	
		key = ftok(FILEPATH, PROJID);
		if (key == -1) {
			perror("ftok()");
			exit(1);
		}
	
		msgid = msgget(key, IPC_CREAT|IPC_EXCL|0600);
		if (msgid == -1) {
			perror("msgget()");
			exit(1);
		}
	
		if (msgctl(msgid, IPC_STAT, &msg_buf) == -1) {
			perror("msgctl()");
			exit(1);
		}
	
		printf("msgid: %d\n", msgid);
		printf("msg_perm.uid: %d\n", msg_buf.msg_perm.uid);
		printf("msg_perm.gid: %d\n", msg_buf.msg_perm.gid);
		printf("msg_stime: %d\n", msg_buf.msg_stime);
		printf("msg_rtime: %d\n", msg_buf.msg_rtime);
		printf("msg_qnum: %d\n", msg_buf.msg_qnum);
		printf("msg_qbytes: %d\n", msg_buf.msg_qbytes);
	}

这个程序可以创建并查看一个消息队列的相关状态，执行结果：

	[zorro@zorro-pc mqueue]$ ./msg_create 
	msgid: 0
	msg_perm.uid: 1000
	msg_perm.gid: 1000
	msg_stime: 0
	msg_rtime: 0
	msg_qnum: 0
	msg_qbytes: 16384

如果我们在次执行这个程序，就会报错，因为key没有变化，我们使用了IPC_CREAT|IPC_EXCL，所以相关队列已经存在了就会报错：

	[zorro@zorro-pc mqueue]$ ./msg_create 
	msgget(): File exists

顺便看一下msgctl方法，我们可以用它来取一个消息队列的相关状态。更详细的信息可以man 2 msgctl查看。除了查看队列状态以外，还可以使用msgctl设置相关队列状态以及删除指定队列。另外我们还可以使用ipcs -q命令查看系统中XSI消息队列的相关状态。其他相关参数请参考man ipcs。

使用msgsnd和msgrcv向队列发送和从队列接收消息。我们先来看看如何访问一个已经存在的消息队列和向其发送消息：

	[zorro@zorro-pc mqueue]$ cat msg_send.c
	#include <sys/types.h>
	#include <sys/ipc.h>
	#include <sys/msg.h>
	#include <stdlib.h>
	#include <stdio.h>
	#include <string.h>
	
	#define FILEPATH "/etc/passwd"
	#define PROJID 1234
	#define MSG "hello world!"
	
	struct msgbuf {
		long mtype;
		char mtext[BUFSIZ];
	};
	
	
	int main()
	{
		int msgid;
		key_t key;
		struct msgbuf buf;
	
		key = ftok(FILEPATH, PROJID);
		if (key == -1) {
			perror("ftok()");
			exit(1);
		}
	
		msgid = msgget(key, 0);
		if (msgid == -1) {
			perror("msgget()");
			exit(1);
		}
	
		buf.mtype = 1;
		strncpy(buf.mtext, MSG, strlen(MSG));
		if (msgsnd(msgid, &buf, strlen(buf.mtext), 0) == -1) {
			perror("msgsnd()");
			exit(1);
		}
	}

使用msgget访问一个已经存在的消息队列时，msgflag指定为0即可。使用msgsnd发送消息时主要需要注意的是它的第二个和第三个参数。第二个参数用来指定要发送的消息，它实际上应该是一个指向某个特殊结构的指针，这个结构可以定义如下：

	struct msgbuf {
		long mtype;
		char mtext[BUFSIZ];
	};

这个结构的mtype实际上是用来指定消息类型的，可以指定的数字必需是个正整数。我们可以把这个概念理解为XSI消息队列对消息优先级的实现方法，即：需要传送的消息体的第一个long长度是用来指定类型的参数，而非消息本身，后面的内容才是消息。在我们实现的消息中，这个结构题可以传送的最大消息长度为BUFSIZE的字节数。当然，如果你的消息并不是一个字符串，也可以将mtype后面的信息实现成各种需要的格式，比如想要发送一个人的名字和他的数学语文成绩的话，可以这样实现：

	struct msgbuf {
		long mtype;
		char name[NAMESIZE];
		int math, chinese;
	};

这实际上就是让使用者自己去设计一个通讯协议，然后发送端和接收端使用约定好的协议进行通讯。msgsnd的第三个参数应该是这个消息结构体除了mtype以外的真实消息的长度，而不是这个结构题的总长度，这点是要注意的。所以，如果你定义了一个很复杂的消息协议的话，建议的长度写法是这样：

	sizeof(buf)-sizeof(long)

msgsnd的最后一个参数可以用来指定IPC_NOWAIT。在消息队列满的情况下，默认的发送行为会阻塞等待，如果加了这个参数，则不会阻塞，而是立即返回，并且errno设置为EAGAIN。然后我们来看接收消息和删除消息队列的例子：

	[zorro@zorro-pc mqueue]$ cat msg_receive.c
	#include <sys/types.h>
	#include <sys/ipc.h>
	#include <sys/msg.h>
	#include <stdlib.h>
	#include <stdio.h>
	#include <string.h>
	
	#define FILEPATH "/etc/passwd"
	#define PROJID 1234
	
	struct msgbuf {
		long mtype;
		char mtext[BUFSIZ];
	};
	
	
	int main()
	{
		int msgid;
		key_t key;
		struct msgbuf buf;
	
		key = ftok(FILEPATH, PROJID);
		if (key == -1) {
			perror("ftok()");
			exit(1);
		}
	
		msgid = msgget(key, 0);
		if (msgid == -1) {
			perror("msgget()");
			exit(1);
		}
	
		if (msgrcv(msgid, &buf, BUFSIZ, 1, 0) == -1) {
			perror("msgrcv()");
			exit(1);
		}
	
		printf("mtype: %d\n", buf.mtype);
		printf("mtype: %s\n", buf.mtext);
	
		if (msgctl(msgid, IPC_RMID, NULL) == -1) {
			perror("msgctl()");
			exit(1);
		}
	
		exit(0);
	}

msgrcv会将消息从指定队列中删除，并将其内容填到其第二个参数指定的buf地址所在的内存中。第三个参数指定承接消息的buf长度，如果消息内容长度大于指定的长度，那么这个函数的行为将取决于最后一个参数msgflag是否设置了MSG_NOERROR，如果这个标志被设定，那消息将被截短，消息剩余部分将会丢失。如果没设置这个标志，msgrcv会失败返回，并且errno被设定为E2BIG。

第四个参数用来指定从消息队列中要取的消息类型msgtyp，如果设置为0，则无论什么类型，取队列中的第一个消息。如果值大于0，则读取符合这个类型的第一个消息，当最后一个参数msgflag设置为MSG_EXCEPT的时候，是对消息类型取逻辑非。即，不等于这个消息类型的第一个消息会被读取。如果指定一个小于0的值，那么将读取消息类型比这个负数的绝对值小的类型的所有消息中的第一个。

最后一个参数msgflag还可以设置为：

IPC_NOWAIT：非阻塞方式读取。当队列为空的时候，msgrcv会阻塞等待。加这个标志后将直接返回，errno被设置为ENOMSG。

MSG_COPY：从Linux 3.8之后开始支持以消息位置的方式读取消息。如果标志为置为MSG_COPY则表示启用这个功能，此时msgtyp的含义将从类型变为位置偏移量，第一个消息的起始值为0。如果指定位置的消息不存在，则返回并设置errno为ENOMSG。并且MSG_COPY和MSG_EXCEPT不能同时设置。另外还要注意这个功能需要内核配置打开CONFIG_CHECKPOINT_RESTORE选项。这个选项默认应该是不开的。

使用msgctl删除消息队列的方法比较简单，不在复述。另外关于msgctl的其他使用，请大家参考msgctl的手册。这部分内容的另外一个权威参考资料就是《UNIX环境高级编程》。我们在这里补充一下Linux系统对XSI消息队列的限制相关参数介绍：

/proc/sys/kernel/msgmax：这个文件限制了系统中单个消息最大的字节数。

/proc/sys/kernel/msgmni：这个文件限制了系统中可创建的最大消息队列个数。

/proc/sys/kernel/msgmnb：这个文件用来限制单个消息队列中可以存放的最大消息字节数。

以上文件都可以使用echo或者sysctl命令进行修改。

## POSIX消息队列

POSIX消息队列是独立于XSI消息队列的一套新的消息队列API，让进程可以用消息的方式进行数据交换。这套消息队列在Linux 2.6.6版本之后开始支持，还需要你的glibc版本必须高于2.3.4。它们使用如下方法进行操作和控制：

	#include <fcntl.h>           /* For O_* constants */
	#include <sys/stat.h>        /* For mode constants */
	#include <mqueue.h>
	
	mqd_t mq_open(const char *name, int oflag);
	mqd_t mq_open(const char *name, int oflag, mode_t mode, struct mq_attr *attr);


类似对文件的open，我们可以用mq_open来打开一个已经创建的消息队列或者创建一个消息队列。这个函数返回一个叫做mqd_t类型的返回值，其本质上还是一个文件描述符，只是在这这里被叫做消息队列描述符（message queue descriptor），在进程里使用这个描述符对消息队列进程操作。所有被创建出来的消息队列在系统中都有一个文件与之对应，这个文件名是通过name参数指定的，这里需要注意的是：name必须是一个以"/"开头的字符串，比如我想让消息队列的名字叫"message"，那么name应该给的是"/message"。消息队列创建完毕后，会在/dev/mqueue目录下产生一个以name命名的文件，我们还可以通过cat这个文件来看这个消息队列的一些状态信息。其它进程在消息队列已经存在的情况下就可以通过mp_open打开名为name的消息队列来访问它。

	int mq_send(mqd_t mqdes, const char *msg_ptr, size_t msg_len, unsigned int msg_prio);
                   
	int mq_timedsend(mqd_t mqdes, const char *msg_ptr, size_t msg_len, unsigned int msg_prio, const struct timespec *abs_timeout);

	ssize_t mq_receive(mqd_t mqdes, char *msg_ptr, size_t msg_len, unsigned int *msg_prio);

	ssize_t mq_timedreceive(mqd_t mqdes, char *msg_ptr, size_t msg_len, unsigned int *msg_prio, const struct timespec *abs_timeout);

在一个消息队列创建完毕之后，我们可以使用mq_send来对消息队列发送消息，mq_receive来对消息队列接收消息。正常的发送消息一般不会阻塞，除非消息队列处在某种异常状态或者消息队列已满的时候，而消息队列在空的时候，如果使用mq_receive去试图接受消息的行为也会被阻塞，所以就有必要为两个方法提供一个带超时时间的版本。这里要注意的是msg_prio这个参数，是用来指定消息优先级的。每个消息都有一个优先级，取值范围是0到sysconf(_SC_MQ_PRIO_MAX) - 1的大小。在Linux上，这个值为32768。默认情况下，消息队列会先按照优先级进行排序，就是msg_prio这个值越大的越先出队列。同一个优先级的消息按照fifo原则处理。在mq_receive方法中的msg_prio是一个指向int的地址，它并不是用来指定取的消息是哪个优先级的，而是会将相关消息的优先级取出来放到相关变量中，以便用户自己处理优先级。

	int mq_close(mqd_t mqdes);

我们可以使用mq_close来关闭一个消息队列，这里的关闭并非删除了相关文件，关闭之后消息队列在系统中依然存在，我们依然可以继续打开它使用。这跟文件的close和unlink的概念是类似的。

	int mq_unlink(const char *name);

使用mq_unlink真正删除一个消息队列。另外，我们还可以使用mq_getattr和mq_setattr来查看和设置消息队列的属性，其函数原型为：

	int mq_getattr(mqd_t mqdes, struct mq_attr *attr);

	int mq_setattr(mqd_t mqdes, const struct mq_attr *newattr, struct mq_attr *oldattr);

mq_attr结构体是这样的结构：

	struct mq_attr {
		long mq_flags;       /* 只可以通过此参数将消息队列设置为是否非阻塞O_NONBLOCK */
		long mq_maxmsg;      /* 消息队列的消息数上限 */
		long mq_msgsize;     /* 消息最大长度 */
		long mq_curmsgs;     /* 消息队列的当前消息个数 */
	};

消息队列描述符河文件描述符一样，当进程通过fork打开一个子进程后，子进程中将从父进程继承相关描述符。此时父子进程中的描述符引用的是同一个消息队列，并且它们的mq_flags参数也将共享。下面我们使用几个简单的例子来看看他们的操作方法：

创建并向消息队列发送消息：

	[zorro@zorro-pc mqueue]$ cat send.c
	#include <fcntl.h>
	#include <sys/stat.h>        /* For mode constants */
	#include <mqueue.h>
	#include <stdlib.h>
	#include <stdio.h>
	#include <errno.h>
	#include <string.h>
	
	#define MQNAME "/mqtest"
	
	
	int main(int argc, char *argv[])
	{
	
		mqd_t mqd;
		int ret;
	
		if (argc != 3) {
			fprintf(stderr, "Argument error!\n");
			exit(1);
		}
	
		mqd = mq_open(MQNAME, O_RDWR|O_CREAT, 0600, NULL);
		if (mqd == -1) {
			perror("mq_open()");
			exit(1);
		}
	
		ret = mq_send(mqd, argv[1], strlen(argv[1]), atoi(argv[2]));
		if (ret == -1) {
			perror("mq_send()");
			exit(1);
		}
	
		exit(0);
	}

注意相关方法在编译的时候需要链接一些库，所以我们可以创建Makefile来解决这个问题：

	[zorro@zorro-pc mqueue]$ cat Makefile 
	CFLAGS+=-lrt -lpthread

我们添加了rt和pthread库，为以后的例子最好准备。当然大家也可以直接使用gcc -lrt -lpthread来解决这个问题，然后我们对程序编译并测试：

	[zorro@zorro-pc mqueue]$ rm send
	[zorro@zorro-pc mqueue]$ make send
	cc -lrt -lpthread    send.c   -o send
	[zorro@zorro-pc mqueue]$ ./send zorro 1
	[zorro@zorro-pc mqueue]$ ./send shrek 2
	[zorro@zorro-pc mqueue]$ ./send jerry 3
	[zorro@zorro-pc mqueue]$ ./send zzzzz 1
	[zorro@zorro-pc mqueue]$ ./send ssssss 2
	[zorro@zorro-pc mqueue]$ ./send jjjjj 3

我们以不同优先级给消息队列添加了几条消息。然后我们可以通过文件来查看相关消息队列的状态：

	[zorro@zorro-pc mqueue]$ cat /dev/mqueue/mqtest 
	QSIZE:31         NOTIFY:0     SIGNO:0     NOTIFY_PID:0 

然后我们来看如何接收消息：

	[zorro@zorro-pc mqueue]$ cat recv.c
	#include <fcntl.h>
	#include <sys/stat.h>        /* For mode constants */
	#include <mqueue.h>
	#include <stdlib.h>
	#include <stdio.h>
	#include <errno.h>
	#include <string.h>
	
	#define MQNAME "/mqtest"
	
	
	int main()
	{
	
		mqd_t mqd;
		int ret;
		int val;
		char buf[BUFSIZ];
	
		mqd = mq_open(MQNAME, O_RDWR);
		if (mqd == -1) {
			perror("mq_open()");
			exit(1);
		}
	
		ret = mq_receive(mqd, buf, BUFSIZ, &val);
		if (ret == -1) {
			perror("mq_send()");
			exit(1);
		}
	
		ret = mq_close(mqd);
		if (ret == -1) {
			perror("mp_close()");
			exit(1);
		}
	
		printf("msq: %s, prio: %d\n", buf, val);
	
		exit(0);
	}

直接编译执行：

	[zorro@zorro-pc mqueue]$ ./recv 
	msq: jerry, prio: 3
	[zorro@zorro-pc mqueue]$ ./recv 
	msq: jjjjj, prio: 3
	[zorro@zorro-pc mqueue]$ ./recv 
	msq: shrek, prio: 2
	[zorro@zorro-pc mqueue]$ ./recv 
	msq: ssssss, prio: 2
	[zorro@zorro-pc mqueue]$ ./recv 
	msq: zorro, prio: 1
	[zorro@zorro-pc mqueue]$ ./recv 
	msq: zzzzz, prio: 1

可以看到优先级对消息队列内部排序的影响。然后是删除这个消息队列：

	[zorro@zorro-pc mqueue]$ cat rmmq.c 
	#include <fcntl.h>
	#include <sys/stat.h>        /* For mode constants */
	#include <mqueue.h>
	#include <stdlib.h>
	#include <stdio.h>
	#include <errno.h>
	#include <string.h>
	
	#define MQNAME "/mqtest"
	
	
	int main()
	{
	
		int ret;
	
		ret = mq_unlink(MQNAME);
		if (ret == -1) {
			perror("mp_unlink()");
			exit(1);
		}
	
		exit(0);
	}

大家在从消息队列接收消息的时候会发现，当消息队列为空的时候，mq_receive会阻塞，直到有人给队列发送了消息才能返回并继续执行。在很多应用场景下，这种同步处理的方式会给程序本身带来性能瓶颈。为此，POSI消息队列使用mq_notify为处理过程增加了一个异步通知机制。使用这个机制，我们就可以让队列在由空变成不空的时候触发一个异步事件，通知调用进程，以便让进程可以在队列为空的时候不用阻塞等待。这个方法的原型为：

	int mq_notify(mqd_t mqdes, const struct sigevent *sevp);

其中sevp用来想内核注册具体的通知行为，可以man 7 sigevent查看相关帮助。这里我们不展开讲解，详细内容将在信号相关内容中详细说明。简单来说，我们可以使用nq_notify方法注册3种行为：SIGEV_NONE，SIGEV_SIGNAL和SIGEV_THREAD。它们分别的含义如下：

SIGEV_NONE：一个“空”提醒。其实就是不提醒。

SIGEV_SIGNAL：当队列中有了消息后给调用进程发送一个信号。可以使用struct sigevent结构体中的sigev_signo指定信号编号，信号的si_code字段将设置为SI_MESGQ以标示这是消息队列的信号。还可以通过si_pid和si_uid来指定信号来自什么pid和什么uid。

SIGEV_THREAD：当队列中有了消息后触发产生一个线程。当设置为线程时，可以使用struct sigevent结构体中的sigev_notify_function指定具体触发什么线程，使用sigev_notify_attributes设置线程属性，使用sigev_value.sival_ptr传递一个任何东西的指针。

我们先来看使用信号的简单例子：

	[zorro@zorro-pc mqueue]$ cat notify_sig.c
	#include <pthread.h>
	#include <mqueue.h>
	#include <stdio.h>
	#include <stdlib.h>
	#include <unistd.h>
	#include <signal.h>
	
	static mqd_t mqdes;
	
	void mq_notify_proc(int sig_num)
	{
		/* mq_notify_proc()是信号处理函数，
		当队列从空变成非空时，会给本进程发送信号，
		触发本函数执行。 */
		
		struct mq_attr attr;
		void *buf;
		ssize_t size;
		int prio;
		struct sigevent sev;
	
		/* 我们约定使用SIGUSR1信号进行处理，
		在此判断发来的信号是不是SIGUSR1。 */
		if (sig_num != SIGUSR1) {
			return;
		}
	
		/* 取出当前队列的消息长度上限作为缓存空间大小。 */
		if (mq_getattr(mqdes, &attr) < 0) {
			perror("mq_getattr()");
			exit(1);
		}
	
		buf = malloc(attr.mq_msgsize);
		if (buf == NULL) {
			perror("malloc()");
			exit(1);
		}
	
		/* 从消息队列中接收消息。 */
		size = mq_receive(mqdes, buf, attr.mq_msgsize, &prio);
		if (size == -1) {
			perror("mq_receive()");
			exit(1);
		}
	
		/* 打印消息和其优先级。 */
		printf("msq: %s, prio: %d\n", buf, prio);
		
		free(buf);
	
		/* 重新注册mq_notify，以便下次可以出触发。 */
		sev.sigev_notify = SIGEV_SIGNAL;
		sev.sigev_signo = SIGUSR1;
		if (mq_notify(mqdes, &sev) == -1) {
			perror("mq_notify()");
			exit(1);
		}
	
		return;
	}
	
	int main(int argc, char *argv[])
	{
		struct sigevent sev;
	
		if (argc != 2) {
			fprintf(stderr, "Argument error!\n");
			exit(1);
		}
	
		/* 注册信号处理函数。 */
		if (signal(SIGUSR1, mq_notify_proc) == SIG_ERR) {
			perror("signal()");
			exit(1);
		}
	
		/* 打开消息队列，注意此队列需要先创建。 */
		mqdes = mq_open(argv[1], O_RDONLY);
		if (mqdes == -1) {
			perror("mq_open()");
			exit(1);
		}
	
		/* 注册mq_notify。 */
		sev.sigev_notify = SIGEV_SIGNAL;
		sev.sigev_signo = SIGUSR1;
		if (mq_notify(mqdes, &sev) == -1) {
			perror("mq_notify()");
			exit(1);
		}
	
		/* 主进程每秒打印一行x，等着从消息队列发来异步信号触发收消息。 */
		while (1) {
			printf("x\n");
			sleep(1);
		}
	}

我们编译这个程序并执行：

	[zorro@zorro-pc mqueue]$ ./notify_sig /mqtest
	x
	x
	...

会一直打印x，等着队列变为非空，我们此时在别的终端给队列发送一个消息：

	[zorro@zorro-pc mqueue]$ ./send hello 1

进程接收到信号，并且现实消息相关内容：

	...
	x
	x
	msq: hello, prio: 1
	x
	...
	
再发一个试试：

	[zorro@zorro-pc mqueue]$ ./send zorro 3

显示：

	...
	x
	msq: zorro, prio: 3
	x
	...

在mq_notify的man手册中，有一个触发线程进行异步处理的例子，我们在此就不再额外写一遍了，在此引用并注释一下，以方便大家理解：

	[zorro@zorro-pc mqueue]$ cat example.c
	#include <pthread.h>
	#include <mqueue.h>
	#include <stdio.h>
	#include <stdlib.h>
	#include <unistd.h>
	
	#define handle_error(msg) \
		do { perror(msg); exit(EXIT_FAILURE); } while (0)
	
	static void                     /* Thread start function */
	tfunc(union sigval sv)
	{
		/* 此函数在队列变为非空的时候会被触发执行 */
		
		struct mq_attr attr;
		ssize_t nr;
		void *buf;
		
		/* 上一个程序时将mqdes实现成了全局变量，而本例子中使用sival_ptr指针传递此变量的值 */
		mqd_t mqdes = *((mqd_t *) sv.sival_ptr);
	
		/* Determine max. msg size; allocate buffer to receive msg */
	
		if (mq_getattr(mqdes, &attr) == -1)
			handle_error("mq_getattr");
		buf = malloc(attr.mq_msgsize);
		if (buf == NULL)
			handle_error("malloc");
		
		/* 打印队列中相关消息信息 */
		nr = mq_receive(mqdes, buf, attr.mq_msgsize, NULL);
		if (nr == -1)
			handle_error("mq_receive");
	
		printf("Read %zd bytes from MQ\n", nr);
		free(buf);
		
		/* 本程序取到消息之后直接退出，不会循环处理。 */
		exit(EXIT_SUCCESS);         /* Terminate the process */
	}
	
	int
	main(int argc, char *argv[])
	{
		mqd_t mqdes;
		struct sigevent sev;
	
		if (argc != 2) {
			fprintf(stderr, "Usage: %s <mq-name>\n", argv[0]);
			exit(EXIT_FAILURE);
		}
	
		mqdes = mq_open(argv[1], O_RDONLY);
		if (mqdes == (mqd_t) -1)
			handle_error("mq_open");
			
		/* 在此指定当异步事件来的时候以线程方式处理，
		触发的线程是：tfunc
		线程属性设置为：NULL
		需要给线程传递消息队列描述符mqdes，以便线程接收消息 */
		
		sev.sigev_notify = SIGEV_THREAD;
		sev.sigev_notify_function = tfunc;
		sev.sigev_notify_attributes = NULL;
		sev.sigev_value.sival_ptr = &mqdes;   /* Arg. to thread func. */
		if (mq_notify(mqdes, &sev) == -1)
			handle_error("mq_notify");
	
		pause();    /* Process will be terminated by thread function */
	}
	
大家可以自行编译执行此程序进行测试。请注意mq_notify的行为：

1. 一个消息队列智能通过mq_notify注册一个进程进行异步处理。
2. 异步通知只会在消息队列从空变成非空的时候产生，其它队列的变动不会触发异步通知。
3. 如果有其他进程使用mq_receive等待队列的消息时，消息到来不会触发已注册mq_notify的程序产生异步通知。队列的消息会递送给在使用mq_receive等待的进程。
4. 一次mq_notify注册只会触发一次异步事件，此后如果队列再次由空变为非空也不会触发异步通知。如果需要一直可以触发，请处理异步通知之后再次注册mq_notify。
5. 如果sevp指定为NULL，表示取消注册异步通知。

POSIX消息队列相对XSI消息队列的一大优势是，我们又一个类似文件描述符的mqd的描述符可以进行操作，所以很自然的我们就会联想到是否可以使用多路IO转接机制对消息队列进程处理？在Linux上，答案是肯定的，我们可以使用select、poll和epoll对队列描述符进行处理，我们在此仅使用epoll举个简单的例子：

	[zorro@zorro-pc mqueue]$ cat recv_epoll.c
	#include <fcntl.h>
	#include <sys/stat.h>
	#include <mqueue.h>
	#include <stdlib.h>
	#include <stdio.h>
	#include <errno.h>
	#include <string.h>
	#include <sys/epoll.h>
	
	#define MQNAME "/mqtest"
	#define EPSIZE 10
	
	
	int main()
	{
	
		mqd_t mqd;
		int ret, epfd, val, count;
		char buf[BUFSIZ];
		struct mq_attr new, old;
		struct epoll_event ev, rev;
	
		mqd = mq_open(MQNAME, O_RDWR);
		if (mqd == -1) {
			perror("mq_open()");
			exit(1);
		}
	
		/* 因为有epoll帮我们等待描述符是否可读，所以对mqd的处理可以设置为非阻塞 */
		new.mq_flags = O_NONBLOCK;
	
		if (mq_setattr(mqd, &new, &old) == -1) {
			perror("mq_setattr()");
			exit(1);
		}
	
		epfd = epoll_create(EPSIZE);
		if (epfd < 0) {
			perror("epoll_create()");
			exit(1);
		}
		
		/* 关注描述符是否可读 */
		ev.events = EPOLLIN;
		ev.data.fd = mqd;
	
		ret = epoll_ctl(epfd, EPOLL_CTL_ADD, mqd, &ev);
		if (ret < 0) {
			perror("epoll_ctl()");
			exit(1);
		}
	
		while (1) {
			ret = epoll_wait(epfd, &rev, EPSIZE, -1);
			if (ret < 0) {
				/* 如果被信号打断则继续epoll_wait */
				if (errno == EINTR) {
					continue;
				} else {
					perror("epoll_wait()");
					exit(1);
				}
			}
	
			/* 此处处理所有返回的描述符（虽然本例子中只有一个） */
			for (count=0;count<ret;count++) {
				ret = mq_receive(rev.data.fd, buf, BUFSIZ, &val);
				if (ret == -1) {
					if (errno == EAGAIN) {
						break;
					}
					perror("mq_receive()");
					exit(1);
				}
				printf("msq: %s, prio: %d\n", buf, val);
			}
	
		}
	
		/* 恢复描述符的flag */
		if (mq_setattr(mqd, &old, NULL) == -1) {
	        perror("mq_setattr()");
	        exit(1);
	    }
	
		ret = mq_close(mqd);
		if (ret == -1) {
			perror("mp_close()");
			exit(1);
		}
		exit(0);
	}

这就是POSIX消息队列比XSI更有趣的地方，XSI的消息队列并未遵守“一切皆文件”的原则。当然，使用select和poll这里就不再举例了，有兴趣的可以自己实现一下作为练习。

以上例子中，我们也分别演示了如何使用mq_setattr和mq_getattr，此处我们应该知道，在所有可以显示的属性中，O_NONBLOCK是mq_setattr唯一可以更改的参数设置，其他参数对于这个方法都是只读的，不能修改。系统提供了其他手段可以对这些限制进行修改：

/proc/sys/fs/mqueue/msg_default：在mq_open的attr参数设置为NULL的时候，这个文件中的数字限定了mq_maxmsg的值，就是队列的消息个数限制。默认为10个，当消息数达到上限之后，再使用mq_send发送消息会阻塞。

/proc/sys/fs/mqueue/msg_max：可以通过mq_open的attr参数设定的mq_maxmsg的数字上限。这个值默认也是10。

/proc/sys/fs/mqueue/msgsize_default：在mq_open的attr参数设置为NULL的时候，这个文件中的数字限定了mq_msgsize的值，就是队列的字节数数限制。

/proc/sys/fs/mqueue/msgsize_max：可以通过mq_open的attr参数设定的mq_msgsize的数字上限。

/proc/sys/fs/mqueue/queues_max：系统可以创建的消息队列个数上限。

## 最后


希望这些内容对大家进一步深入了解Linux的消息队列有帮助。如果有相关问题，可以在我的微博、微信或者博客上联系我。


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

