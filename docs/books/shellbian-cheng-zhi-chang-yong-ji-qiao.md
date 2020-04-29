# SHELL编程之常用技巧

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

本文是shell编程系列的第六篇，集中介绍了bash编程中部分高级编程方法和技巧。通过学习本文内容，可以帮你解决以下问题：

1. bash可以网络编程么？
2. .(){ .|.& };. 据说执行这些符号可以死机，那么它们是啥意思？
3. 你是什么保证crond中的任务不重复执行的？grep一下然后wc算一下个数么？
4. 受限模式执行bash可以保护什么？
5. 啥时候会出现subshell？
6. coproc协进程怎么用？

## /dev和/proc目录

dev目录是系统中集中用来存放设备文件的目录。除了设备文件以外，系统中也有不少特殊的功能通过设备的形式表现出来。设备文件是一种特殊的文件，它们实际上是驱动程序的接口。在Linux操作系统中，很多设备都是通过设备文件的方式为进程提供了输入、输出的调用标准，这也符合UNIX的“一切皆文件”的设计原则。所以，对于设备文件来说，文件名和路径其实都不重要，最重要的使其主设备号和辅助设备号，就是用ls -l命令显示出来的原本应该出现在文件大小位置上的两个数字，比如下面命令显示的8和0：

	[zorro@zorrozou-pc0 bash]$ ls -l /dev/sda
	brw-rw---- 1 root disk 8, 0 5月  12 10:47 /dev/sda

设备文件的主设备号对应了这种设备所使用的驱动是哪个，而辅助设备号则表示使用同一种驱动的设备编号。我们可以使用mknod命令手动创建一个设备文件：

	[zorro@zorrozou-pc0 bash]$ sudo mknod harddisk b 8 0 
	[zorro@zorrozou-pc0 bash]$ ls -l harddisk 
	brw-r--r-- 1 root root 8, 0 5月  18 09:49 harddisk

这样我们就创建了一个设备文件叫harddisk，实际上它跟/dev/sda是同一个设备，因为它们对应的设备驱动和编号都一样。所以这个设备实际上是跟sda相同功能的设备。

系统还给我们提供了几个有特殊功能的设备文件，在bash编程的时候可能会经常用到：

/dev/null：黑洞文件。可以对它重定向如何输出。

/dev/zero：0发生器。可以产生二进制的0，产生多少根使用时间长度有关。我们经常用这个文件来产生大文件进行某些测试，如：

	[zorro@zorrozou-pc0 bash]$ dd if=/dev/zero of=./bigfile bs=1M count=1024
	1024+0 records in
	1024+0 records out
	1073741824 bytes (1.1 GB, 1.0 GiB) copied, 0.3501 s, 3.1 GB/s
	
dd命令也是我们在bash编程中可能会经常使用到的命令。

/dev/random：Linux下的random文件是一个根据计算机背景噪声而产生随机数的真随机数发生器。所以，如果容纳噪声数据的熵池空了，那么对文件的读取会出现阻塞。

/dev/urandom：是一个伪随机数发生器。实际上在Linux的视线中，urandom产生随机数的方法根random一样，只是它可以重复使用熵池中的数据。这两个文件在不同的类unix系统中可能实现方法不同，请注意它们的区别。

/dev/tcp & /dev/udp：这两个神奇的目录为bash编程提供了一种可以进行网络编程的功能。在bash程序中使用/dev/tcp/ip/port的方式就可以创建一个scoket作为客户端去连接服务端的ip:port。我们用一个检查http协议的80端口是否打开的例子来说明它的使用方法：

	[zorro@zorrozou-pc0 bash]$ cat tcp.sh
	#!/bin/bash
	
	ipaddr=127.0.0.1
	port=80
	
	if ! exec 5<> /dev/tcp/$ipaddr/$port
	then
		exit 1
	fi
	
	echo -e "GET / HTTP/1.0\n" >&5
	
	cat <&5

ipaddr的部分还可以写一个主机名。大家可以用此脚本分别在本机打开web服务和不打开的情况下分别执行观察是什么效果。

/proc是另一个我们经常使用的目录。这个目录完全是内核虚拟的。内核将一些系统信息都放在/proc目录下一文件和文本的方式显示出来，如：/proc/cpuinfo、/proc/meminfo。我们可以使用man 5 proc来查询这个目录下文件的作用。

##函数和递归

我们已经接触过函数的概念了，在bash编程中，函数无非是将一串命令起了个名字，后续想要调用这一串命令就可以直接写函数的名字了。在语法上定义一个函数的方法是：
	
	name () compound-command [redirection]
	function name [()] compound-command [redirection]

我们可以加function关键字显式的定义一个函数，也可以不加。函数在定义的时候可以直接在后面加上重定向的处理。这里还需要特殊说明的是函数的参数处理和局部变量，请看下面脚本：

	[zorro@zorrozou-pc0 bash]$ cat function.sh |awk '{print "\t"$0}'
	#!/bin/bash
	
	aaa=1000
	
	arg_proc () {
		echo "Function begin:"
		local aaa=2000
		echo $1
		echo $2
		echo $3
		echo $*
		echo $@
		echo $aaa
		echo "Function end!"
	}
	
	echo "Script bugin:"
	echo $1
	echo $2
	echo $3
	echo $*
	echo $@
	echo $aaa
	
	arg_proc aaa bbb ccc ddd eee fff
	
	echo $1
	echo $2
	echo $3
	echo $*
	echo $@
	echo $aaa
	echo "Script end!"

我们带-x参数执行一下：

	+ aaa=1000
	+ echo 'Script bugin:'
	Script bugin:
	+ echo 111
	111
	+ echo 222
	222
	+ echo 333
	333
	+ echo 111 222 333 444 555
	111 222 333 444 555
	+ echo 111 222 333 444 555
	111 222 333 444 555
	+ echo 1000
	1000
	+ arg_proc aaa bbb ccc ddd eee fff
	+ echo 'Function begin:'
	Function begin:
	+ local aaa=2000
	+ echo aaa
	aaa
	+ echo bbb
	bbb
	+ echo ccc
	ccc
	+ echo aaa bbb ccc ddd eee fff
	aaa bbb ccc ddd eee fff
	+ echo aaa bbb ccc ddd eee fff
	aaa bbb ccc ddd eee fff
	+ echo 2000
	2000
	+ echo 'Function end!'
	Function end!
	+ echo 111
	111
	+ echo 222
	222
	+ echo 333
	333
	+ echo 111 222 333 444 555
	111 222 333 444 555
	+ echo 111 222 333 444 555
	111 222 333 444 555
	+ echo 1000
	1000
	+ echo 'Script end!'
	Script end!

观察整个执行过程可以发现，函数的参数适用方法跟脚本一样，都可以使用$n、$*、$@这些符号来处理。而且函数参数跟函数内部使用local定义的局部变量效果一样，都是只在函数内部能看到。函数外部看不到函数里定义的局部变量，当函数内部的局部变量和外部的全局变量名字相同时，函数内只能取到局部变量的值。当函数内部没有定义跟外部同名的局部变量的时候，函数内部也可以看到全局变量。

bash编程支持递归调用函数，跟其他编程语言不同的地方是，bash还可以递归的调用自身，这在某些编程场景下非常有用。我们先来看一个递归的简单例子：

	[zorro@zorrozou-pc0 bash]$ cat recurse.sh
	#!/bin/bash
	
	read_dir () {
		for i in $1/*
		do
			if [ -d $i ]
			then
				read_dir $i
			else
				echo $i
			fi
		done
	
	}
	
	read_dir $1

这个脚本可以遍历一个目录下所有子目录中的非目录文件。关于递归，还有一个经典的例子，fork炸弹：

	.(){ .|.& };.

这一堆符号看上去很令人费解，我们来解释一下每个符号的含义：根据函数的定义语法，我们知道.(){}的意思是，定义一个函数名子叫“.”。虽然系统中又个内建命令也叫.，就是source命令，但是我们也知道，当函数和内建命令名字冲突的时候，bash首先会将名字当成是函数来解释。在{}包含的函数体中，使用了一个管道连接了两个点，这里的第一个.就是函数的递归调用，我们也知道了使用管道的时候会打开一个subshell的子进程，所以在这里面就递归的打开了子进程。{}后面的分号只表示函数定义完毕的结束符，在之后就是调用函数名执行的.，之后函数开始递归的打开自己，去产生子进程，直到系统崩溃为止。

##bash并发编程和flock

在shell编程中，需要使用并发编程的场景并不多。我们倒是经常会想要某个脚本不要同时出现多次同时执行，比如放在crond中的某个周期任务，如果执行时间较长以至于下次再调度的时间间隔，那么上一个还没执行完就可能又打开一个，这时我们会希望本次不用执行。本质上讲，无论是只保证任何时候系统中只出现一个进程还是多个进程并发，我们需要对进程进行类似的控制。因为并发的时候也会有可能产生竞争条件，导致程序出问题。

我们先来看如何写一个并发的bash程序。在前文讲到作业控制和wait命令使用的时候，我们就已经写了一个简单的并发程序了，我们这次让它变得复杂一点。我们写一个bash脚本，创建一个计数文件，并将里面的值写为0。然后打开100个子进程，每个进程都去读取这个计数文件的当前值，并加1写回去。如果程序执行正确，最后里面的值应该是100，因为每个子进程都会累加一个1写入文件，我们来试试：

	[zorro@zorrozou-pc0 bash]$ cat racing.sh
	#!/bin/bash
	
	countfile=/tmp/count
	
	if ! [ -f $countfile ]
	then
		echo 0 > $countfile
	fi
	
	do_count () {
		read count < $countfile
		echo $((++count)) > $countfile
	}
	
	for i in `seq 1 100`
	do
		 do_count &
	done
	
	wait
	
	cat $countfile
	
	rm $countfile

我们再来看看这个程序的执行结果：

	[zorro@zorrozou-pc0 bash]$ ./racing.sh 
	26
	[zorro@zorrozou-pc0 bash]$ ./racing.sh 
	13
	[zorro@zorrozou-pc0 bash]$ ./racing.sh 
	34
	[zorro@zorrozou-pc0 bash]$ ./racing.sh 
	25
	[zorro@zorrozou-pc0 bash]$ ./racing.sh 
	45
	[zorro@zorrozou-pc0 bash]$ ./racing.sh 
	5

多次执行之后，每次得到的结果都不一样，也没有一次是正确的结果。这就是典型的竞争条件引起的问题。当多个进程并发的时候，如果使用的共享的资源，就有可能会造成这样的问题。这里的竞争调教就是：当某一个进程读出文件值为0，并加1，还没写回去的时候，如果有别的进程读了文件，读到的还是0。于是多个进程会写1，以及其它的数字。解决共享文件的竞争问题的办法是使用文件锁。每个子进程在读取文件之前先给文件加锁，写入之后解锁，这样临界区代码就可以互斥执行了：

	[zorro@zorrozou-pc0 bash]$ cat flock.sh
	#!/bin/bash
	
	countfile=/tmp/count
	
	if ! [ -f $countfile ]
	then
		echo 0 > $countfile
	fi
	
	do_count () {
		exec 3< $countfile
		#对三号描述符加互斥锁
		flock -x 3
		read -u 3 count
		echo $((++count)) > $countfile
		#解锁
		flock -u 3
		#关闭描述符也会解锁
		exec 3>&-
	}
	
	for i in `seq 1 100`
	do
		 do_count &
	done
	
	wait
	
	cat $countfile
	
	rm $countfile
	[zorro@zorrozou-pc0 bash]$ ./flock.sh 
	100

对临界区代码进行加锁处理之后，程序执行结果正确了。仔细思考一下程序之后就会发现，这里所谓的临界区代码由加锁前的并行，变成了加锁后的串行。flock的默认行为是，如果文件之前没被加锁，则加锁成功返回，如果已经有人持有锁，则加锁行为会阻塞，直到成功加锁。所以，我们也可以利用互斥锁的这个特征，让bash脚本不会重复执行。

	[zorro@zorrozou-pc0 bash]$ cat repeat.sh
	#!/bin/bash
	
	exec 3> /tmp/.lock
	
	if ! flock -xn 3
	then
		echo "already running!"
		exit 1
	fi
	
	echo "running!"
	sleep 30
	echo "ending"
	
	flock -u 3
	exec 3>&-
	rm /tmp/.lock
	
	exit 0

-n参数可以让flock命令以非阻塞方式探测一个文件是否已经被加锁，所以可以使用互斥锁的特点保证脚本运行的唯一性。脚本退出的时候锁会被释放，所以这里可以不用显式的使用flock解锁。flock除了-u参数指定文件描述符锁文件以外，还可以作为执行命令的前缀使用。这种方式非常适合直接在crond中方式所要执行的脚本重复执行。如：

	*/1 * * * * /usr/bin/flock -xn /tmp/script.lock -c '/home/bash/script.sh'

关于flock的其它参数，可以man flock找到说明。

##受限bash

以受限模式执行bash程序，有时候是很有必要的。这种模式可以保护我们的很多系统环境不受bash程序的误操作影响。启动受限模式的bash的方法是使用-r参数，或者也可以rbash的进程名方式执行bash。受限模式的bash和正常bash时间的差别是：

1. 不能使用cd命令改变当前工作目录。
2. 不能改变SHELL、PATH、ENV和BASH_ENV环境变量。
3. 不能调用含有/的命令路径。
4. 不能使用.执行带有/字符的命令路径。
5. 不能使用hash命令的-p参数指定一个带斜杠\的参数。
6. 不能在shell环境启动的时候加载函数的定义。
7. 不能检查SHELLOPTS变量的内容。
8. 不能使用>, >|, <>, >&, &>和 >>重定向操作符。
9. 不能使用exec命令使用一个新程序替换当前执行的bash进程。
10. enable内建命令不能使用-f、-d参数。
11. 不可以使用enable命令打开或者关闭内建命令。
12. command命令不可以使用-p参数。
13. 不能使用set +r或者set +o restricted命令关闭受限模式。

测试一个简单的受限模式：

	[zorro@zorrozou-pc0 bash]$ cat restricted.sh 
	#!/bin/bash

	set -r

	cd /tmp
	[zorro@zorrozou-pc0 bash]$ ./restricted.sh 
	./restricted.sh: line 5: cd: restricted


##subshell

我们前面接触过subshell的概念，我们之前说的是，当一个命令放在()中的时候，bash会打开一个子进程去执行相关命令，这个子进程实际上是另一个bash环境，叫做subshell。当然包括放在()中执行的命令，bash会在以下情况下打开一个subshell执行命令：

1. 使用&作为命令结束提交了作业控制任务时。
2. 使用|连接的命令会在subshell中打开。
3. 使用()封装的命令。
4. 使用coproc（bash 4.0版本之后支持）作为前缀执行的命令。
5. 要执行的文件不存在或者文件存在但不具备可执行权限的时候，这个执行过程会打开一个subshell执行。

在subshell中，有些事情需要注意。subshell中的$$取到的仍然是父进程bash的pid，如果想要取到subshell的pid，可以使用BASHPID变量：

	[zorro@zorrozou-pc0 bash]$ echo $$ ;echo $BASHPID && (echo $$;echo $BASHPID)
	5484
	5484
	5484
	24584

可以使用BASH_SUBSHELL变量的值来检查当前环境是不是在subshell中，这个值在非subshell中是0；每进入一层subshell就加1。

	[zorro@zorrozou-pc0 bash]$ echo $BASH_SUBSHELL;(echo $BASH_SUBSHELL;(echo $BASH_SUBSHELL))
	0
	1
	2

在subshell中做的任何操作都不会影响父进程的bash执行环境。subshell除了PID和trap相关设置外，其他的环境都跟父进程是一样的。subshell的trap设置跟父进程刚启动的时候还没做trap设置之前一样。

##协进程coprocess

在bash 4.0版本之后，为我们提供了一个coproc关键字可以支持协进程。协进程提供了一种可以上bash移步执行另一个进程的工作模式，实际上跟作业控制类似。严格来说，bash的协进程就是使用作业控制作为实现手段来做的。它跟作业控制的区别仅仅在于，协进程的标准输入和标准输出都在调用协进程的bash中可以取到文件描述符，而作业控制进程的标准输入和输出都是直接指向终端的。我们来看看使用协进程的语法：

	coproc [NAME] command [redirections]
	
使用coproc作为前缀，后面加执行的命令，可以将命令放到作业控制里执行。并且在bash中可以通过一些方法查看到协进程的pid和使用它的输入和输出。例子：

	zorro@zorrozou-pc0 bash]$ cat coproc.sh
	#!/bin/bash
	#例一：简单命令使用
	#简单命令使用不能通过NAME指定协进程的名字，此时进程的名字统一为：COPROC。
	coproc tail -3 /etc/passwd
	echo $COPROC_PID
	exec 0<&${COPROC[0]}-
	cat
	
	#例二：复杂命令使用
	#此时可以使用NAME参数指定协进程名称，并根据名称产生的相关变量获得协进程pid和描述符。
	
	coproc _cat { tail -3 /etc/passwd; }
	echo $_cat_PID
	exec 0<&${_cat[0]}-
	cat
	
	#例三：更复杂的命令以及输入输出使用
	#协进程的标准输入描述符为：NAME[1]，标准输出描述符为：NAME[0]。
	
	coproc print_username {
		while read string
		do
			[ "$string" = "END" ] && break
			echo $string | awk -F: '{print $1}'
		done
	}
	
	echo "aaa:bbb:ccc" 1>&${print_username[1]}
	echo ok
	
	read -u ${print_username[0]} username
	
	echo $username
	
	cat /etc/passwd >&${print_username[1]}
	echo END >&${print_username[1]}
	
	while read -u ${print_username[0]} username
	do
		echo $username
	done
	
执行结果：

	[zorro@zorrozou-pc0 bash]$ ./coproc.sh
	31953
	jerry:x:1001:1001::/home/jerry:/bin/bash
	systemd-coredump:x:994:994:systemd Core Dumper:/:/sbin/nologin
	netdata:x:134:134::/var/cache/netdata:/bin/nologin
	31955
	jerry:x:1001:1001::/home/jerry:/bin/bash
	systemd-coredump:x:994:994:systemd Core Dumper:/:/sbin/nologin
	netdata:x:134:134::/var/cache/netdata:/bin/nologin
	ok
	aaa
	root
	bin
	daemon
	mail
	ftp
	http
	uuidd
	dbus
	nobody
	systemd-journal-gateway
	systemd-timesync
	systemd-network
	systemd-bus-proxy
	systemd-resolve
	systemd-journal-remote
	systemd-journal-upload
	polkitd
	avahi
	colord
	rtkit
	gdm
	usbmux
	git
	gnome-initial-setup
	zorro
	nvidia-persistenced
	ntp
	jerry
	systemd-coredump
	netdata


##最后

本文主要介绍了一些bash编程的常用技巧，主要包括的知识点为：

1. /dev/和/proc目录的使用。
2. 函数和递归。
3. 并发编程和flock。
4. 受限bash。
5. subshell。
6. 协进程。

至此，我们的bash编程系列就算结束了。当然，shell其实到现在才刚刚开始。毕竟我们要真正实现有用的bash程序，还需要积累大量命令的使用。本文篇幅有限，就不探讨外部命令的详细使用方法和技巧了。希望这一系列内容对大家进一步深入了解bash编程有帮助。

如果有相关问题，可以在我的微博、微信或者博客上联系我。


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

