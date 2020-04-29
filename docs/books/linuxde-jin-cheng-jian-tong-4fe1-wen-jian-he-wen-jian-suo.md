# Linux的进程间通信-文件和文件锁

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

使用文件进行进程间通信应该是最先学会的一种IPC方式。任何编程语言中，文件IO都是很重要的知识，所以使用文件进行进程间通信就成了很自然被学会的一种手段。考虑到系统对文件本身存在缓存机制，使用文件进行IPC的效率在某些多读少写的情况下并不低下。但是大家似乎经常忘记IPC的机制可以包括“文件”这一选项。

我们首先引入文件进行IPC，试图先使用文件进行通信引入一个竞争条件的概念，然后使用文件锁解决这个问题，从而先从文件的角度来管中窥豹的看一下后续相关IPC机制的总体要解决的问题。阅读本文可以帮你解决以下问题：

1. 什么是竞争条件（racing）？。
2. flock和lockf有什么区别？
3. flockfile函数和flock与lockf有什么区别？
4. 如何使用命令查看文件锁？


## 竞争条件（racing）

我们的第一个例子是多个进程写文件的例子，虽然还没做到通信，但是这比较方便的说明一个通信时经常出现的情况：竞争条件。假设我们要并发100个进程，这些进程约定好一个文件，这个文件初始值内容写0，每一个进程都要打开这个文件读出当前的数字，加一之后将结果写回去。在理想状态下，这个文件最后写的数字应该是100，因为有100个进程打开、读数、加1、写回，自然是有多少个进程最后文件中的数字结果就应该是多少。但是实际上并非如此，可以看一下这个例子：


	[zorro@zorrozou-pc0 process]$ cat racing.c
	#include <unistd.h>
	#include <stdlib.h>
	#include <stdio.h>
	#include <errno.h>
	#include <fcntl.h>
	#include <string.h>
	#include <sys/file.h>
	#include <wait.h>
	
	#define COUNT 100
	#define NUM 64
	#define FILEPATH "/tmp/count"
	
	int do_child(const char *path)
	{
		/* 这个函数是每个子进程要做的事情
		每个子进程都会按照这个步骤进行操作：
		1. 打开FILEPATH路径的文件
		2. 读出文件中的当前数字
		3. 将字符串转成整数
		4. 整数自增加1
		5. 将证书转成字符串
		6. lseek调整文件当前的偏移量到文件头
		7. 将字符串写会文件
		当多个进程同时执行这个过程的时候，就会出现racing：竞争条件，
		多个进程可能同时从文件独到同一个数字，并且分别对同一个数字加1并写回，
		导致多次写回的结果并不是我们最终想要的累积结果。 */
		int fd;
		int ret, count;
		char buf[NUM];
		fd = open(path, O_RDWR);
		if (fd < 0) {
			perror("open()");
			exit(1);
		}
		/*	*/
		ret = read(fd, buf, NUM);
		if (ret < 0) {
			perror("read()");
			exit(1);
		}
		buf[ret] = '\0';
		count = atoi(buf);
		++count;
		sprintf(buf, "%d", count);
		lseek(fd, 0, SEEK_SET);
		ret = write(fd, buf, strlen(buf));
		/*	*/
		close(fd);
		exit(0);
	}
	
	int main()
	{
		pid_t pid;
		int count;
	
		for (count=0;count<COUNT;count++) {
			pid = fork();
			if (pid < 0) {
				perror("fork()");
				exit(1);
			}
	
			if (pid == 0) {
				do_child(FILEPATH);
			}
		}
	
		for (count=0;count<COUNT;count++) {
			wait(NULL);
		}
	}

这个程序做后执行的效果如下：

	[zorro@zorrozou-pc0 process]$ make racing
	cc     racing.c   -o racing
	[zorro@zorrozou-pc0 process]$ echo 0 > /tmp/count
	[zorro@zorrozou-pc0 process]$ ./racing 
	[zorro@zorrozou-pc0 process]$ cat /tmp/count 
	71[zorro@zorrozou-pc0 process]$ 
	[zorro@zorrozou-pc0 process]$ echo 0 > /tmp/count
	[zorro@zorrozou-pc0 process]$ ./racing 
	[zorro@zorrozou-pc0 process]$ cat /tmp/count 
	61[zorro@zorrozou-pc0 process]$ 
	[zorro@zorrozou-pc0 process]$ echo 0 > /tmp/count
	[zorro@zorrozou-pc0 process]$ ./racing 
	[zorro@zorrozou-pc0 process]$ cat /tmp/count 
	64[zorro@zorrozou-pc0 process]$ 

我们执行了三次这个程序，每次结果都不太一样，第一次是71，第二次是61，第三次是64，全都没有得到预期结果，这就是**竞争条件(racing)**引入的问题。仔细分析这个进程我们可以发现这个竞争条件是如何发生的：

最开始文件内容是0，假设此时同时打开了3个进程，那么他们分别读文件的时候，这个过程是可能并发的，于是每个进程读到的数组可能都是0，因为他们都在别的进程没写入1之前就开始读了文件。于是三个进程都是给0加1，然后写了个1回到文件。其他进程以此类推，每次100个进程的执行顺序可能不一样，于是结果是每次得到的值都可能不太一样，但是一定都少于产生的实际进程个数。于是我们把这种多个执行过程（如进程或线程）中访问同一个共享资源，而这些共享资源又有无法被多个执行过程存取的的程序片段，叫做临界区代码。

那么该如何解决这个racing的问题呢？对于这个例子来说，可以用文件锁的方式解决这个问题。就是说，对**临界区**代码进行加锁，来解决**竞争条件**的问题。哪段是临界区代码？在这个例子中，两端/*   */之间的部分就是临界区代码。一个正确的例子是：

	...
		ret = flock(fd, LOCK_EX);
		if (ret == -1) {
			perror("flock()");
			exit(1);
		}
	
		ret = read(fd, buf, NUM);
		if (ret < 0) {
			perror("read()");
			exit(1);
		}
		buf[ret] = '\0';
		count = atoi(buf);
		++count;
		sprintf(buf, "%d", count);
		lseek(fd, 0, SEEK_SET);
		ret = write(fd, buf, strlen(buf));
		ret = flock(fd, LOCK_UN);
		if (ret == -1) {
			perror("flock()");
			exit(1);
		}
	...
	
我们将临界区部分代码前后都使用了flock的互斥锁，防止了临界区的racing。这个例子虽然并没有真正达到让多个进程通过文件进行通信，解决某种协同工作问题的目的，但是足以表现出进程间通信机制的一些问题了。**当涉及到数据在多个进程间进行共享的时候，仅仅只实现数据通信或共享机制本身是不够的，还需要实现相关的同步或异步机制来控制多个进程，达到保护临界区或其他让进程可以处理同步或异步事件的能力。**我们可以认为文件锁是可以实现这样一种多进程的协调同步能力的机制，而除了文件锁以外，还有其他机制可以达到相同或者不同的功能，我们会在下文中继续详细解释。

再次，我们并不对flock这个方法本身进行功能性讲解。这种功能性讲解大家可以很轻易的在网上或者通过别的书籍得到相关内容。本文更加偏重的是Linux环境提供了多少种文件锁以及他们的区别是什么？

## flock和lockf

从底层的实现来说，Linux的文件锁主要有两种：flock和lockf。需要额外对lockf说明的是，它只是fcntl系统调用的一个封装。从使用角度讲，lockf或fcntl实现了更细粒度文件锁，即：记录锁。我们可以使用lockf或fcntl对文件的部分字节上锁，而flock只能对整个文件加锁。这两种文件锁是从历史上不同的标准中起源的，flock来自BSD而lockf来自POSIX，所以lockf或fcntl实现的锁在类型上又叫做POSIX锁。

除了这个区别外，fcntl系统调用还可以支持强制锁（Mandatory locking）。强制锁的概念是传统UNIX为了强制应用程序遵守锁规则而引入的一个概念，与之对应的概念就是建议锁（Advisory locking）。我们日常使用的基本都是建议锁，它并不强制生效。这里的**不强制生效**的意思是，如果某一个进程对一个文件持有一把锁之后，其他进程仍然可以直接对文件进行各种操作的，比如open、read、write。只有当多个进程在操作文件前都去检查和对相关锁进行锁操作的时候，文件锁的规则才会生效。这就是一般建议锁的行为。而强制性锁试图实现一套内核级的锁操作。当有进程对某个文件上锁之后，其他进程即使不在操作文件之前检查锁，也会在open、read或write等文件操作时发生错误。内核将对有锁的文件在任何情况下的锁规则都生效，这就是强制锁的行为。由此可以理解，如果内核想要支持强制锁，将需要在内核实现open、read、write等系统调用内部进行支持。

从应用的角度来说，**Linux内核虽然号称具备了强制锁的能力，但其对强制性锁的实现是不可靠的**，建议大家还是不要在Linux下使用强制锁。事实上，在我目前手头正在使用的Linux环境上，一个系统在mount -o mand分区的时候报错(archlinux kernel 4.5)，而另一个系统虽然可以以强制锁方式mount上分区，但是功能实现却不完整，主要表现在只有在加锁后产生的子进程中open才会报错，如果直接write是没问题的，而且其他进程无论open还是read、write都没问题（Centos 7 kernel 3.10）。鉴于此，我们就不在此介绍如何在Linux环境中打开所谓的强制锁支持了。我们只需知道，在Linux环境下的应用程序，flock和lockf在是锁类型方面没有本质差别，他们都是建议锁，而非强制锁。

flock和lockf另外一个差别是它们实现锁的方式不同。这在应用的时候表现在flock的语义是针对文件的锁，而lockf是针对文件描述符（fd）的锁。我们用一个例子来观察这个区别：

	[zorro@zorrozou-pc0 locktest]$ cat flock.c
	#include <stdlib.h>
	#include <stdio.h>
	#include <sys/types.h>
	#include <sys/stat.h>
	#include <fcntl.h>
	#include <unistd.h>
	#include <sys/file.h>
	#include <wait.h>
	
	#define PATH "/tmp/lock"
	
	int main()
	{
	    int fd;
	    pid_t pid;
	
	    fd = open(PATH, O_RDWR|O_CREAT|O_TRUNC, 0644);
	    if (fd < 0) {
	        perror("open()");
	        exit(1);
	    }
	
	    if (flock(fd, LOCK_EX) < 0) {
			perror("flock()");
			exit(1);
		}
	    printf("%d: locked!\n", getpid());
	
	    pid = fork();
	    if (pid < 0) {
	        perror("fork()");
	        exit(1);
	    }
	
		if (pid == 0) {
	/*
			fd = open(PATH, O_RDWR|O_CREAT|O_TRUNC, 0644);
			if (fd < 0) {
					perror("open()");
					exit(1);
			}
	*/
	        if (flock(fd, LOCK_EX) < 0) {
	            perror("flock()");
	            exit(1);
	        }
	        printf("%d: locked!\n", getpid());
	        exit(0);
	    }
	    wait(NULL);
		unlink(PATH);
	    exit(0);
	}
	
上面代码是一个flock的例子，其作用也很简单：

1. 打开/tmp/lock文件。
2. 使用flock对其加互斥锁。
3. 打印“PID：locked！”表示加锁成功。
4. 打开一个子进程，在子进程中使用flock对同一个文件加互斥锁。
5. 子进程打印“PID：locked！”表示加锁成功。如果没加锁成功子进程会推出，不显示相关内容。
6. 父进程回收子进程并推出。

这个程序直接编译执行的结果是：

	[zorro@zorrozou-pc0 locktest]$ ./flock 
	23279: locked!
	23280: locked!

父子进程都加锁成功了。这个结果似乎并不符合我们对文件加锁的本意。按照我们对互斥锁的理解，子进程对父进程已经加锁过的文件应该加锁失败才对。我们可以稍微修改一下上面程序让它达到预期效果，将子进程代码段中的注释取消掉重新编译即可：

	...
	/*
			fd = open(PATH, O_RDWR|O_CREAT|O_TRUNC, 0644);
			if (fd < 0) {
					perror("open()");
					exit(1);
			}
	*/
	...

将这段代码上下的/*  */删除重新编译。之后执行的效果如下：

	[zorro@zorrozou-pc0 locktest]$ make flock
	cc     flock.c   -o flock
	[zorro@zorrozou-pc0 locktest]$ ./flock 
	23437: locked!

此时子进程flock的时候会阻塞，让进程的执行一直停在这。这才是我们使用文件锁之后预期该有的效果。而相同的程序使用lockf却不会这样。这个原因在于flock和lockf的语义是不同的。使用lockf或fcntl的锁，在实现上关联到文件结构体，这样的实现导致锁不会在fork之后被子进程继承。而flock在实现上关联到的是文件描述符，这就意味着如果我们在进程中复制了一个文件描述符，那么使用flock对这个描述符加的锁也会在新复制出的描述符中继续引用。在进程fork的时候，新产生的子进程的描述符也是从父进程继承（复制）来的。在子进程刚开始执行的时候，父子进程的描述符关系实际上跟在一个进程中使用dup复制文件描述符的状态一样（参见《UNIX环境高级编程》8.3节的**文件共享**部分）。这就可能造成上述例子的情况，通过fork产生的多个进程，因为子进程的文件描述符是复制的父进程的文件描述符，所以导致父子进程同时持有对同一个文件的互斥锁，导致第一个例子中的子进程仍然可以加锁成功。这个文件共享的现象在子进程使用open重新打开文件之后就不再存在了，所以重新对同一文件open之后，子进程再使用flock进行加锁的时候会阻塞。另外要注意：除非文件描述符被标记了close-on-exec标记，flock锁和lockf锁都可以穿越exec，在当前进程变成另一个执行镜像之后仍然保留。

上面的例子中只演示了fork所产生的文件共享对flock互斥锁的影响，同样原因也会导致dup或dup2所产生的文件描述符对flock在一个进程内产生相同的影响。dup造成的锁问题一般只有在多线程情况下才会产生影响，所以应该避免在多线程场景下使用flock对文件加锁，而lockf/fcntl则没有这个问题。

为了对比flock的行为，我们在此列出使用lockf的相同例子，来演示一下它们的不同：

	[zorro@zorrozou-pc0 locktest]$ cat lockf.c
	#include <stdlib.h>
	#include <stdio.h>
	#include <sys/types.h>
	#include <sys/stat.h>
	#include <fcntl.h>
	#include <unistd.h>
	#include <sys/file.h>
	#include <wait.h>
	
	#define PATH "/tmp/lock"
	
	int main()
	{
	    int fd;
	    pid_t pid;
	
	    fd = open(PATH, O_RDWR|O_CREAT|O_TRUNC, 0644);
	    if (fd < 0) {
	        perror("open()");
	        exit(1);
	    }
	
		if (lockf(fd, F_LOCK, 0) < 0) {
			perror("lockf()");
			exit(1);
		}
	    printf("%d: locked!\n", getpid());
	
	    pid = fork();
	    if (pid < 0) {
	        perror("fork()");
	        exit(1);
	    }
	
		if (pid == 0) {
	/*
			fd = open(PATH, O_RDWR|O_CREAT|O_TRUNC, 0644);
			if (fd < 0) {
				perror("open()");
				exit(1);
			}
	*/
			if (lockf(fd, F_LOCK, 0) < 0) {
				perror("lockf()");
				exit(1);
			}
			printf("%d: locked!\n", getpid());
	        exit(0);
	    }
	    wait(NULL);
		unlink(PATH);	
	    exit(0);
	}

编译执行的结果是：

	[zorro@zorrozou-pc0 locktest]$ ./lockf 
	27262: locked!
	
在子进程不用open重新打开文件的情况下，进程执行仍然被阻塞在子进程lockf加锁的操作上。关于fcntl对文件实现记录锁的详细内容，大家可以参考《UNIX环境高级编程》中关于记录锁的14.3章节。

##标准IO库文件锁

C语言的标准IO库中还提供了一套文件锁，它们的原型如下：

	#include <stdio.h>

	void flockfile(FILE *filehandle);
	int ftrylockfile(FILE *filehandle);
	void funlockfile(FILE *filehandle);

从实现角度来说，stdio库中实现的文件锁与flock或lockf有本质区别。作为一种标准库，其实现的锁必然要考虑跨平台的特性，所以其结构都是在用户态的FILE结构体中实现的，而非内核中的数据结构来实现。这直接导致的结果就是，标准IO的锁在多进程环境中使用是有问题的。进程在fork的时候会复制一整套父进程的地址空间，这将导致子进程中的FILE结构与父进程完全一致。就是说，父进程如果加锁了，子进程也将持有这把锁，父进程没加锁，子进程由于地址空间跟父进程是独立的，所以也无法通过FILE结构体检查别的进程的用户态空间是否家了标准IO库提供的文件锁。这种限制导致这套文件锁只能处理一个进程中的多个线程之间共享的FILE *的进行文件操作。就是说，多个线程必须同时操作一个用fopen打开的FILE *变量，如果内部自己使用fopen重新打开文件，那么返回的FILE *地址不同，也起不到线程的互斥作用。

我们分别将两种使用线程的状态的例子分别列出来，第一种是线程之间共享同一个FILE *的情况，这种情况互斥是没问题的：

	[zorro@zorro-pc locktest]$ cat racing_pthread_sharefp.c
	#include <unistd.h>
	#include <stdlib.h>
	#include <stdio.h>
	#include <errno.h>
	#include <fcntl.h>
	#include <string.h>
	#include <sys/file.h>
	#include <wait.h>
	#include <pthread.h>
	
	#define COUNT 100
	#define NUM 64
	#define FILEPATH "/tmp/count"
	static FILE *filep;
	
	void *do_child(void *p)
	{
		int fd;
		int ret, count;
		char buf[NUM];
	
		flockfile(filep);
	
		if (fseek(filep, 0L, SEEK_SET) == -1) {
			perror("fseek()");
		}
		ret = fread(buf, NUM, 1, filep);
	
		count = atoi(buf);
		++count;
		sprintf(buf, "%d", count);
		if (fseek(filep, 0L, SEEK_SET) == -1) {
			perror("fseek()");
		}
		ret = fwrite(buf, strlen(buf), 1, filep);
	
		funlockfile(filep);
	
		return NULL;
	}
	
	int main()
	{
		pthread_t tid[COUNT];
		int count;
	
		filep = fopen(FILEPATH, "r+");
		if (filep == NULL) {
			perror("fopen()");
			exit(1);
		}
	
		for (count=0;count<COUNT;count++) {
			if (pthread_create(tid+count, NULL, do_child, NULL) != 0) {
				perror("pthread_create()");
				exit(1);
			}
		}
	
		for (count=0;count<COUNT;count++) {
			if (pthread_join(tid[count], NULL) != 0) {
				perror("pthread_join()");
				exit(1);
			}
		}
	
		fclose(filep);
	
		exit(0);
	}

另一种情况是每个线程都fopen重新打开一个描述符，此时线程是不能互斥的：

	[zorro@zorro-pc locktest]$ cat racing_pthread_threadfp.c
	#include <unistd.h>
	#include <stdlib.h>
	#include <stdio.h>
	#include <errno.h>
	#include <fcntl.h>
	#include <string.h>
	#include <sys/file.h>
	#include <wait.h>
	#include <pthread.h>
	
	#define COUNT 100
	#define NUM 64
	#define FILEPATH "/tmp/count"
	
	void *do_child(void *p)
	{
		int fd;
		int ret, count;
		char buf[NUM];
		FILE *filep;
	
		filep = fopen(FILEPATH, "r+");
		if (filep == NULL) {
			perror("fopen()");
			exit(1);
		}
	
		flockfile(filep);
	
		if (fseek(filep, 0L, SEEK_SET) == -1) {
			perror("fseek()");
		}
		ret = fread(buf, NUM, 1, filep);
	
		count = atoi(buf);
		++count;
		sprintf(buf, "%d", count);
		if (fseek(filep, 0L, SEEK_SET) == -1) {
			perror("fseek()");
		}
		ret = fwrite(buf, strlen(buf), 1, filep);
	
		funlockfile(filep);
	
		fclose(filep);
		return NULL;
	}
	
	int main()
	{
		pthread_t tid[COUNT];
		int count;
	
	
		for (count=0;count<COUNT;count++) {
			if (pthread_create(tid+count, NULL, do_child, NULL) != 0) {
				perror("pthread_create()");
				exit(1);
			}
		}
	
		for (count=0;count<COUNT;count++) {
			if (pthread_join(tid[count], NULL) != 0) {
				perror("pthread_join()");
				exit(1);
			}
		}
	
	
		exit(0);
	}

以上程序大家可以自行编译执行看看效果。

##文件锁相关命令

系统为我们提供了flock命令，可以方便我们在命令行和shell脚本中使用文件锁。需要注意的是，flock命令是使用flock系统调用实现的，所以在使用这个命令的时候请注意进程关系对文件锁的影响。flock命令的使用方法和在脚本编程中的使用可以参见我的另一篇文章《shell编程之常用技巧》中的**bash并发编程和flock**这部分内容，在此不在赘述。

我们还可以使用lslocks命令来查看当前系统中的文件锁使用情况。一个常见的现实如下：

	[root@zorrozou-pc0 ~]# lslocks 
	COMMAND           PID   TYPE  SIZE MODE  M      START        END PATH
	firefox         16280  POSIX    0B WRITE 0          0          0 /home/zorro/.mozilla/firefox/bk2bfsto.default/.parentlock
	dmeventd          344  POSIX    4B WRITE 0          0          0 /run/dmeventd.pid
	gnome-shell       472  FLOCK    0B WRITE 0          0          0 /run/user/120/wayland-0.lock
	flock           27452  FLOCK    0B WRITE 0          0          0 /tmp/lock
	lvmetad           248  POSIX    4B WRITE 0          0          0 /run/lvmetad.pid

这其中，TYPE主要表示锁类型，就是上文我们描述的flock和lockf。lockf和fcntl实现的锁事POSIX类型。M表示是否事强制锁，0表示不是。如果是记录锁的话，START和END表示锁住文件的记录位置，0表示目前锁住的是整个文件。MODE主要用来表示锁的权限，实际上这也说明了锁的共享属性。在系统底层，互斥锁表示为WRITE，而共享锁表示为READ，如果这段出现*则表示有其他进程正在等待这个锁。其余参数可以参考man lslocks。

##最后

本文通过文件盒文件锁的例子，引出了竞争条件这样在进程间通信中需要解决的问题。并深入探讨了系统编程中常用的文件锁的实现和应用特点。希望大家对进程间通信和文件锁的使用有更深入的理解。


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

