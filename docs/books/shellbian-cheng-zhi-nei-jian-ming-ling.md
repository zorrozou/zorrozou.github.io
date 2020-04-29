# SHELL编程之内建命令

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

本文是shell编程系列的第五篇，集中介绍了bash相关内建命令的使用。通过学习本文内容，可以帮你解决以下问题：

1. 什么是内建命令？为什么要有内建命令？
2. 为啥echo 111 222 333 444 555| read -a test之后echo ${test[*]}不好使？
3. ./script和. script有啥区别？
4. 如何让让kill杀不掉你的bash脚本？
5. 如何更优雅的处理bash的命令行参数？

## 为什么要有内建命令

内建命令是指bash内部实现的命令。bash在执行这些命令的时候不同于一般外部命令的fork、exec、wait的处理过程，这内建功能本身不需要打开一个子进程执行，而是bash本身就可以进行处理。分析外部命令的执行过程我们可以理解内建命令的重要性，外建命令都会打开一个子进程执行，所以有些功能没办法通过外建命令实现。比如当我们想改变当前bash进程的某些环境的时候，如：切换当前进程工作目录，如果打开一个子进程，切换之后将会改变子进程的工作目录，与当前bash没关系。所以内建命令基本都是从必须放在bash内部实现的命令。bash所有的内建命令只有50多个，绝大多数的命令我们在之前的介绍中都已经使用过了。下面我们就把它们按照使用的场景分类之后，分别介绍一下在bash编程中可能会经常用到的内建命令。

## 输入输出

对于任何编程语言来说，程序跟文件的输入输出都是非常重要的内容，bash编程当然也不例外。所有的shell编程与其他语言在IO处理这一块的最大区别就是，shell可以直接使用命令进行处理，而其他语言基本上都要依赖IO处理的库和函数进行处理。所以对于shell编程来说，IO处理的相关代码写起来要简单的多。本节我们只讨论bash内建的IO处理命令，而外建的诸如grep、sed、awk这样的高级处理命令不在本文的讨论范围内。

**source**：

**.**：

以上两个命令：source和.实际上是同一个内建命令，它们的功能完全一样，只是两种不同写法。我们都应该见过这样一种写法，如：

    for i in /etc/profile.d/*.sh; do
        if [ -r "$i" ]; then
            if [ "$PS1" ]; then
                . "$i"
            else
                . "$i" >/dev/null 2>&1
            fi
        fi
    done

这里的". $i"实际上就是source $i。这个命令的含义是：**读取文件的内容，并在当前bash环境下将其内容当命令执行。**注意，这与输入一个可执行脚本的路径的执行方式是不同的。路径执行的方式会打开一个子进程的bash环境去执行脚本中的内容，而source方式将会直接在当前bash环境中执行其内容。所以这种方式主要用于想引用一个脚本中的内容用来改变当前bash环境。如：加载环境变量配置脚本或从另一个脚本中引用其定义的函数时。我们可以通过如下例子来理解一下这个内建命令的作用：

	[zorro@zorrozou-pc0 bash]$ cat source.sh 
	#!/bin/bash
	
	aaa=1000
	
	echo $aaa
	echo $$
	[zorro@zorrozou-pc0 bash]$ ./source.sh 
	1000
	27051
	[zorro@zorrozou-pc0 bash]$ echo $aaa
	
	[zorro@zorrozou-pc0 bash]$ . source.sh 
	1000
	17790
	[zorro@zorrozou-pc0 bash]$ echo $aaa
	1000
	[zorro@zorrozou-pc0 bash]$ echo $$
	17790

我们可以通过以上例子中的$aaa变量看到当前bash环境的变化，可以通过$$变量，看到不同执行过程的进程环境变化。

**read**：

这个命令可以让bash从标准输入读取输字符串到一个变量中。用法如下：

	[zorro@zorrozou-pc0 bash]$ cat input.sh 
	#!/bin/bash

	read -p "Login: " username

	read -p "Passwd: " password

	echo $username

	echo $password

程序执行结果：

	[zorro@zorrozou-pc0 bash]$ ./input.sh 
	Login: zorro
	Passwd: zorro
	zorro
	zorro

我们可以利用read命令实现一些简单的交互程序。read自带提示输出功能，-p参数可以让read在读取输入之前先打印一个字符串。read命令除了可以读取输入并赋值一个变量以外，还可以赋值一个数组，比如我们想把一个命令的输出读到一个数组中，使用方法是：

	[zorro@zorrozou-pc0 bash]$ cat read.sh 
	#!/bin/bash

	
	read -a test
	
	echo ${test[*]}

执行结果：

	[zorro@zorrozou-pc0 bash]$ ./read.sh 
	111 222 333 444 555
	111 222 333 444 555

输入为：111 222 333 444 555，就会打印出整个数组列表。

**mapfile**：

**readarray**：

这两个命令又是同一个命令的两种写法。它们的功能是，**将一个文本文件直接变成一个数组，每行作为数组的一个元素。**这对某些程序的处理是很方便的。尤其是当你要对某些文件进行全文的分析或者处理的时候，比一行一行读进来处理方便的多。用法：

	[zorro@zorrozou-pc0 bash]$ cat mapfile.sh 
	#!/bin/bash

	exec 3< /etc/passwd

	mapfile -u 3 passwd 

	exec 3<&-

	echo ${#passwd}

	for ((i=0;i<${#passwd};i++))
	do
		echo ${passwd[$i]}
	done

程序输出：

	[zorro@zorrozou-pc0 bash]$ ./mapfile.sh 
	32
	root:x:0:0:root:/root:/bin/bash
	bin:x:1:1:bin:/bin:/usr/bin/nologin
	daemon:x:2:2:daemon:/:/usr/bin/nologin
	...
	
本例子中使用了-u参数，表示让mapfile或readarray命令从一个文件描述符读取，如果不指定文件描述符，命令将默认从标准输入读取。所以很多人可能习惯用管道的方式读取，如：

	[zorro@zorrozou-pc0 bash]$ cat /etc/passwd|mapfile passwd
	[zorro@zorrozou-pc0 bash]$ echo ${passwd[*]}

但是最后却发现passwd变量根本不存在。这个原因是：**如果内建命令放到管道环境中执行，那么bash会给它创建一个subshell进行处理。于是创建的数组实际上与父进程没有关系。**这点是使用内建命令需要注意的一点。同样，read命令也可能会出现类似的使用错误。如：

	echo 111 222 333 444 555| read -a test
	
执行完之后，我们在bash脚本环境中仍然无法读取到test变量的值，也是同样的原因。

mapfile的其他参数，大家可以自行参考help mapfile或help readarray取得帮助。

**echo**：

**printf**：

这两个都是用来做输出的命令，其中echo是我们经常使用的，就不啰嗦了，具体参数可以help echo。printf命令是一个用来进行格式化输出的命令，跟C语言或者其他语言的printf格式化输出的方法都类似，比如：

	[zorro@zorrozou-pc0 bash]$ printf "%d\t%s %f\n" 123 zorro 1.23
	123	zorro 1.230000

使用很简单，具体也请参见：help printf。

##作业控制

作业控制指的是jobs功能。一般情况下bash执行命令的方式是打开一个子进程并wait等待其退出，所以bash在等待一个命令执行的过程中不能处理其他命令。而jobs功能给我们提供了一种办法，可以让bash不用显示的等待子进程执行完毕后再处理别的命令，在命令行中使用这个功能的方法是在命令后面加&符号，表明进程放进作业控制中处理，如：

	[zorro@zorrozou-pc0 bash]$ sleep 3000 &
	[1] 30783
	[zorro@zorrozou-pc0 bash]$ sleep 3000 &
	[2] 30787
	[zorro@zorrozou-pc0 bash]$ sleep 3000 &
	[3] 30791
	[zorro@zorrozou-pc0 bash]$ sleep 3000 &
	[4] 30795
	[zorro@zorrozou-pc0 bash]$ sleep 3000 &
	[5] 30799

我们放了5个sleep进程进入jobs作业控制。大家可以当作这是bash提供给我们的一种“并发处理”方式。此时我们可以使用jobs命令查看作业系统中有哪些进程在执行：

	[zorro@zorrozou-pc0 bash]$ jobs
	[1]   Running                 sleep 3000 &
	[2]   Running                 sleep 3000 &
	[3]   Running                 sleep 3000 &
	[4]-  Running                 sleep 3000 &
	[5]+  Running                 sleep 3000 &

除了数字外，这里还有+和-号标示。+标示当前作业任务，-表示备用的当前作业任务。所谓的当前作业，就是最后一个被放到作业控制中的进程，而备用的则是当前进程如果退出，那么备用的就会变成当前的。这些jobs进程可以使用编号和PID的方式控制，如：

	[zorro@zorrozou-pc0 bash]$ kill %1
	[1]   Terminated              sleep 3000
	[zorro@zorrozou-pc0 bash]$ jobs
	[2]   Running                 sleep 3000 &
	[3]   Running                 sleep 3000 &
	[4]-  Running                 sleep 3000 &
	[5]+  Running                 sleep 3000 &

表示杀掉1号作业任务，还可以使用kill %+或者kill %-以及kill %%（等同于%+）。除了可以kill这些进程以外，bash还提供了其他控制命令：

**fg**：
**bg**：

将指定的作业进程回到前台让当前bash去wait。如：

	[zorro@zorrozou-pc0 bash]$ fg %5
	sleep 3000
	

于是当前bash又去“wait”5号作业任务了。当然fg后面也可以使用%%、％+、%-等符号，如果fg不加参数效果跟fg %+也是一样的。让一个当前bash正在wait的进程回到作业控制，可以使用ctrl+z快捷键，这样会让这个进程处于stop状态：

	[zorro@zorrozou-pc0 bash]$ fg %5
	sleep 3000
	^Z
	[5]+  Stopped                 sleep 3000

	[zorro@zorrozou-pc0 bash]$ jobs
	[2]   Running                 sleep 3000 &
	[3]   Running                 sleep 3000 &
	[4]-  Running                 sleep 3000 &
	[5]+  Stopped                 sleep 3000

这个进程目前是stopped的，想让它再运行起来可以使用bg命令：

	[zorro@zorrozou-pc0 bash]$ bg %+
	[5]+ sleep 3000 &
	[zorro@zorrozou-pc0 bash]$ jobs
	[2]   Running                 sleep 3000 &
	[3]   Running                 sleep 3000 &
	[4]-  Running                 sleep 3000 &
	[5]+  Running                 sleep 3000 &

**disown**：

disown命令可以让一个jobs作业控制进程脱离作业控制，变成一个“野”进程：

	[zorro@zorrozou-pc0 bash]$ disown 
	[zorro@zorrozou-pc0 bash]$ jobs
	[2]   Running                 sleep 3000 &
	[3]-  Running                 sleep 3000 &
	[4]+  Running                 sleep 3000 &

直接回车的效果跟diswon ％+是一样的，也是处理当前作业进程。这里要注意的是，disown之后的进程仍然是还在运行的，只是bash不会wait它，jobs中也不在了。

##信号处理

进程在系统中免不了要处理信号，即使是bash。我们至少需要使用命令给别进程发送信号，于是就有了kill命令。kill这个命令应该不用多说了，但是需要大家更多理解的是信号的概念。大家可以使用kill -l命令查看信号列表：

	[zorro@zorrozou-pc0 bash]$ kill -l
	 1) SIGHUP	 2) SIGINT	 3) SIGQUIT	 4) SIGILL	 5) SIGTRAP
	 6) SIGABRT	 7) SIGBUS	 8) SIGFPE	 9) SIGKILL	10) SIGUSR1
	11) SIGSEGV	12) SIGUSR2	13) SIGPIPE	14) SIGALRM	15) SIGTERM
	16) SIGSTKFLT	17) SIGCHLD	18) SIGCONT	19) SIGSTOP	20) SIGTSTP
	21) SIGTTIN	22) SIGTTOU	23) SIGURG	24) SIGXCPU	25) SIGXFSZ
	26) SIGVTALRM	27) SIGPROF	28) SIGWINCH	29) SIGIO	30) SIGPWR
	31) SIGSYS	34) SIGRTMIN	35) SIGRTMIN+1	36) SIGRTMIN+2	37) SIGRTMIN+3
	38) SIGRTMIN+4	39) SIGRTMIN+5	40) SIGRTMIN+6	41) SIGRTMIN+7	42) SIGRTMIN+8
	43) SIGRTMIN+9	44) SIGRTMIN+10	45) SIGRTMIN+11	46) SIGRTMIN+12	47) SIGRTMIN+13
	48) SIGRTMIN+14	49) SIGRTMIN+15	50) SIGRTMAX-14	51) SIGRTMAX-13	52) SIGRTMAX-12
	53) SIGRTMAX-11	54) SIGRTMAX-10	55) SIGRTMAX-9	56) SIGRTMAX-8	57) SIGRTMAX-7
	58) SIGRTMAX-6	59) SIGRTMAX-5	60) SIGRTMAX-4	61) SIGRTMAX-3	62) SIGRTMAX-2
	63) SIGRTMAX-1	64) SIGRTMAX	

每个信号的意思以及进程接收到相关信号的默认行为了这个内容大家可以参见《UNIX环境高级编程》。我们在此先只需知道，常用的信号有2号（crtl c就是发送2号信号），15号（kill默认发送），9号（著名的kill -9）这几个就可以了。其他我们还需要知道，这些信号绝大多数是可以被进程设置其相应行为的，除了9号和19号信号。这也是为什么我们一般用kill直接无法杀掉的进程都会再用kill -9试试的原因。

那么既然进程可以设置信号的行为，bash中如何处理呢？使用trap命令。方法如下：

	[zorro@zorrozou-pc0 bash]$ cat trap.sh 
	#!/bin/bash

	trap 'echo hello' 2 15
	trap 'exit 17' 3

	while :
	do
		sleep 1
	done

trap命令的格式如下：

	trap [-lp] [[arg] signal_spec ...]

在我们的例子中，第一个trap命令的意思是，定义针对2号和15号信号的行为，当进程接收到这两个信号的时候，将执行echo hello。第二个trap的意思是，如果进程接收到3号信号将执行exit 17，以17为返回值退出进程。然后我们来看一下进程执行的效果：

	[zorro@zorrozou-pc0 bash]$ ./trap.sh 
	^Chello
	^Chello
	^Chello
	^Chello
	^Chello
	hello
	hello

此时按ctrl+c和kill这个bash进程都会让进程打印hello。3号信号可以用ctrl+\发送：

	[zorro@zorrozou-pc0 bash]$ ./trap.sh 
	^Chello
	^Chello
	^Chello
	^Chello
	^Chello
	hello
	hello
	^\Quit (core dumped)
	[zorro@zorrozou-pc0 bash]$ echo $?
	17

此时进程退出，返回值是17，而不是128+3=131。这就是trap命令的用法。

**suspend**：

bash还提供了一种让bash执行暂停并等待信号的功能，就是suspend命令。它等待的是18号SIGCONT信号，这个信号本身的含义就是让一个处在T（stop）状态的进程恢复运行。使用方法：

	[zorro@zorrozou-pc0 bash]$ cat suspend.sh 
	#!/bin/bash

	pid=$$

	echo "echo $pid"
	#打开jobs control功能，在没有这个功能suspend无法使用，脚本中默认此功能关闭。
	#我们并不推荐在脚本中开启此功能。
	set -m

	echo "Begin!"

	echo $-

	echo "Enter suspend stat:"

	#让一个进程十秒后给本进程发送一个SIGCONT信号
	( sleep 10 ; kill -18 $pid ) &
	#本进程进入等待
	suspend 

	echo "Get SIGCONT and continue running."

	echo "End!"

执行效果：

	[zorro@zorrozou-pc0 bash]$ ./suspend.sh 
	echo 31833
	Begin!
	hmB
	Enter suspend stat:

	[1]+  Stopped                 ./suspend.sh

十秒之后：	

	[zorro@zorrozou-pc0 bash]$ 
	[zorro@zorrozou-pc0 bash]$ Get SIGCONT and continue running.
	End!

以上是suspend在脚本中的使用方法。另外，suspend默认不能在非loginshell中使用，如果使用，需要加-f参数。

##进程控制

bash中也实现了基本的进程控制方法。主要的命令有exit，exec，logout，wait。其中exit我们已经了解了。logout的功能跟exit实际上差不多，区别只是logout是专门用来退出login方式的bash的。如果bash不是login方式执行的，logout会报错：

	[zorro@zorrozou-pc0 bash]$ cat logout.sh 
	#!/bin/bash

	logout
	[zorro@zorrozou-pc0 bash]$ ./logout.sh 
	./logout.sh: line 3: logout: not login shell: use `exit'

**wait**：

wait命令的功能是用来等待jobs作业控制进程退出的。因为一般进程默认行为就是要等待其退出之后才能继续执行。wait可以等待指定的某个jobs进程，也可以等待所有jobs进程都退出之后再返回，实际上wait命令在bash脚本中是可以作为类似“屏障”这样的功能使用的。考虑这样一个场景，我们程序在运行到某一个阶段之后，需要并发的执行几个jobs，并且一定要等到这些jobs都完成工作才能继续执行，但是每个jobs的运行时间又不一定多久，此时，我们就可以用这样一个办法：

	[zorro@zorrozou-pc0 bash]$ cat wait.sh 
	#!/bin/bash

	echo "Begin:"

	(sleep 3; echo 3) &
	(sleep 5; echo 5) &
	(sleep 7; echo 7) &
	(sleep 9; echo 9) &

	wait

	echo parent continue

	sleep 3

	echo end!
	[zorro@zorrozou-pc0 bash]$ ./wait.sh 
	Begin:
	3
	5
	7
	9
	parent continue
	end!

通过这个例子可以看到wait的行为：在不加任何参数的情况下，wait会等到所有作业控制进程都退出之后再回返回，否则就会一直等待。当然，wait也可以指定只等待其中一个进程，可以指定pid和jobs方式的作业进程编号，如%3，就变成了：

	[zorro@zorrozou-pc0 bash]$ cat wait.sh 
	#!/bin/bash

	echo "Begin:"

	(sleep 3; echo 3) &
	(sleep 5; echo 5) &
	(sleep 7; echo 7) &
	(sleep 9; echo 9) &

	wait %3

	echo parent continue

	sleep 3

	echo end!
	[zorro@zorrozou-pc0 bash]$ ./wait.sh 
	Begin:
	3
	5
	7
	parent continue
	9
	end!

**exec**：

我们已经在重定向那一部分讲过exec处理bash程序的文件描述符的使用方法了，在此补充一下它是如何执行命令的。这个命令的执行过程跟exec族的函数功能是一样的：**将当前进程的执行镜像替换成指定进程的执行镜像。**还是举例来看：

	[zorro@zorrozou-pc0 bash]$ cat exec.sh 
	#!/bin/bash

	echo "Begin:"

	echo "Before exec:"

	exec ls /etc/passwd

	echo "After exec:"

	echo "End!"
	[zorro@zorrozou-pc0 bash]$ ./exec.sh 
	Begin:
	Before exec:
	/etc/passwd

实际上这个脚本在执行到exec ls /etc/passwd之后，bash进程就已经替换为ls进程了，所以后续的echo命令都不会执行，ls执行完，这个进程就完全退出了。

##命令行参数处理

我们已经学习过使用shift方式处理命令行参数了，但是这个功能还是比较简单，它每次执行就仅仅是将参数左移一位而已，将本次的$2变成下次的$1。bash也给我们提供了一个更为专业的命令行参数处理方法，这个命令是getopts。

我们都知道一般的命令参数都是通过-a、-b、-c这样的参数来指定各种功能的，如果我们想要实现这样的功能，只单纯使用shift这样的方式手工处理将会非常麻烦，而且还不能支持让-a -b写成-ab这样的方式。bash跟其他语言一样，提供了getopts这样的方法来帮助我们处理类似的问题，如：

	[zorro@zorrozou-pc0 bash]$ cat getopts.sh 
	#!/bin/bash

	#getopts的使用方式：字母后面带:的都是需要执行子参数的，如：-c xxxxx -e xxxxxx，后续可以用$OPTARG变量进行判断。
	#getopts会将输入的-a -b分别赋值给arg变量，以便后续判断。
	while getopts "abc:de:f" arg
	do
		case $arg in
			a)
			echo "aaaaaaaaaaaaaaa"
			;;
			b)
			echo "bbbbbbbbbbbbbbb"
			;;
			c)
			echo "c: arg:$OPTARG"
			;;
			d)
			echo "ddddddddddddddd"
			;;
			e)
			echo "e: arg:$OPTARG"
			;;
			f)
			echo "fffffffffffffff"
			;;
			?)
			echo "$arg :no this arguments!"
		esac
	done
	
以下为程序输出：

	[zorro@zorrozou-pc0 bash]$ ./getopts.sh -a -bd -c zorro -e jerry 
	aaaaaaaaaaaaaaa
	bbbbbbbbbbbbbbb
	ddddddddddddddd
	c: arg:zorro
	e: arg:jerry
	[zorro@zorrozou-pc0 bash]$ ./getopts.sh -c xxxxxxx
	c: arg:xxxxxxx
	[zorro@zorrozou-pc0 bash]$ ./getopts.sh -a
	aaaaaaaaaaaaaaa
	[zorro@zorrozou-pc0 bash]$ ./getopts.sh -f
	fffffffffffffff
	[zorro@zorrozou-pc0 bash]$ ./getopts.sh -g
	./getopts.sh: illegal option -- g
	unknow argument!

getopts只能处理段格式参数，如：-a这样的。不能支持的是如--login这种长格式参数。实际上我们的系统中还给了一个getopt命令，可以处理长格式参数。这个命令不是内建命令，使用方法跟getopts类似，大家可以自己man getopt近一步学习这个命令的使用，这里就不再赘述了。

##进程环境

内建命令中最多的就是关于进程环境的配置的相关命令，当然绝大多数我们之前已经会用了。它们包括：alias、unalias、cd、declare、typeset、dirs、enable、export、hash、history、popd、pushd、local、pwd、readonly、set、unset、shopt、ulimit、umask。

我们在这需要简单说明的命令有：

**declare**：

**typeset**：

这两个命令用来声明或显示进程的变量或函数相关信息和属性。如：

declare -a array：可以声明一个数组变量。

declare -A array：可以声明一个关联数组。

declare -f func：可以声明或查看一个函数。

其他常用参数可以help declare查看。

**enable**：

可以用来打开或者关闭某个内建命令的功能。

**dirs**：

**popd**：

**pushd**：

dirs、popd、pushd可以用来操作目录栈。目录栈是bash提供的一种纪录曾经去过的相关目录的缓存数据结构，可以方便的使操作者在多个深层次的目录中方便的跳转。使用演示：

显示当前目录栈：

	[zorro@zorrozou-pc0 dirstack]$ dirs
	~/bash/dirstack
	
只有一个当前工作目录。将aaa加入目录栈：
	
	[zorro@zorrozou-pc0 dirstack]$ pushd aaa
	~/bash/dirstack/aaa ~/bash/dirstack
	
pushd除了将目录加入了目录栈外，还改变了当前工作目录。
	
	[zorro@zorrozou-pc0 aaa]$ pwd
	/home/zorro/bash/dirstack/aaa
	
将bbb目录加入目录栈：
	
	[zorro@zorrozou-pc0 aaa]$ pushd ../bbb/
	~/bash/dirstack/bbb ~/bash/dirstack/aaa ~/bash/dirstack
	[zorro@zorrozou-pc0 bbb]$ dirs
	~/bash/dirstack/bbb ~/bash/dirstack/aaa ~/bash/dirstack
	[zorro@zorrozou-pc0 bbb]$ pwd
	/home/zorro/bash/dirstack/bbb
	
加入ccc、ddd、eee目录：
	
	[zorro@zorrozou-pc0 bbb]$ pushd ../ccc
	~/bash/dirstack/ccc ~/bash/dirstack/bbb ~/bash/dirstack/aaa ~/bash/dirstack
	[zorro@zorrozou-pc0 ccc]$ pushd ../ddd
	~/bash/dirstack/ddd ~/bash/dirstack/ccc ~/bash/dirstack/bbb ~/bash/dirstack/aaa ~/bash/dirstack
	[zorro@zorrozou-pc0 ddd]$ pushd ../eee
	~/bash/dirstack/eee ~/bash/dirstack/ddd ~/bash/dirstack/ccc ~/bash/dirstack/bbb ~/bash/dirstack/aaa ~/bash/dirstack
	[zorro@zorrozou-pc0 eee]$ dirs
	~/bash/dirstack/eee ~/bash/dirstack/ddd ~/bash/dirstack/ccc ~/bash/dirstack/bbb ~/bash/dirstack/aaa ~/bash/dirstack
	
将当前工作目录切换到目录栈中的第2个目录，即当前的ddd目录：
	
	[zorro@zorrozou-pc0 eee]$ pushd +1
	~/bash/dirstack/ddd ~/bash/dirstack/ccc ~/bash/dirstack/bbb ~/bash/dirstack/aaa ~/bash/dirstack ~/bash/dirstack/eee
	
将当前工作目录切换到目录栈中的第5个目录，即当前的~/bash/dirstack目录:
	
	[zorro@zorrozou-pc0 ddd]$ pushd +4
	~/bash/dirstack ~/bash/dirstack/eee ~/bash/dirstack/ddd ~/bash/dirstack/ccc ~/bash/dirstack/bbb ~/bash/dirstack/aaa

+N表示当前目录栈从左往右数的第N个，第一个是左边的第一个目录，从0开始。
将当前工作目录切换到目录栈中的倒数第3个目录，即当前的ddd目录:
	
	[zorro@zorrozou-pc0 dirstack]$ pushd -3
	~/bash/dirstack/ddd ~/bash/dirstack/ccc ~/bash/dirstack/bbb ~/bash/dirstack/aaa ~/bash/dirstack ~/bash/dirstack/eee
	
-N表示当亲啊目录栈从右往左数的第N个，第一个是右边的第一个目录，从0开始。
从目录栈中推出一个目录，默认推出当前所在的目录：	

	[zorro@zorrozou-pc0 ccc]$ popd 
	~/bash/dirstack/ddd ~/bash/dirstack/bbb ~/bash/dirstack/aaa ~/bash/dirstack ~/bash/dirstack/eee
	[zorro@zorrozou-pc0 ddd]$ popd 
	~/bash/dirstack/bbb ~/bash/dirstack/aaa ~/bash/dirstack ~/bash/dirstack/eee
	
指定要推出的目录编号，数字含义跟pushd一样：
	
	[zorro@zorrozou-pc0 bbb]$ popd +2
	~/bash/dirstack/bbb ~/bash/dirstack/aaa ~/bash/dirstack/eee
	[zorro@zorrozou-pc0 bbb]$ popd -2
	~/bash/dirstack/aaa ~/bash/dirstack/eee
	[zorro@zorrozou-pc0 aaa]$ pushd +1
	~/bash/dirstack/eee ~/bash/dirstack/aaa


**readonly**：

声明一个只读变量。

**local**：

声明一个局部变量。bash的局部变量概念很简单，它只能在函数中使用，并且局部变量只有在函数中可见。

**set**：

**shopt**：

我们之前已经讲过这两个命令的使用。这里补充一下其他信息，请参见：http://www.cnblogs.com/ziyunfei/p/4913758.html

**eval**：

eval是一个可能会被经常用到的内建命令。它的作用其实很简单，就是将指定的命令解析两次。可以这样理解这个命令：

首先我们定义一个变量：

	[zorro@zorrozou-pc0 bash]$ pipe="|"
	[zorro@zorrozou-pc0 bash]$ echo $pipe
	|

这个变量时pipe，值就是"|"这个字符。然后我们试图在后续命令中引入管道这个功能，但是管道符是从变量中引入的，如：

	[zorro@zorrozou-pc0 bash]$ cat /etc/passwd $pipe wc -l
	cat: invalid option -- 'l'
	Try 'cat --help' for more information.

此时执行报错了，因为bash在解释这条命令的时候，并不会先将$pipe解析成"|"再做解释。这时候我们需要让bash先解析$pipe，然后得到"|"字符之后，再将cat /etc/passwd ｜ wc -l当成一个要执行的命令传给bash解释执行。此时我们需要eval：

	［zorro@zorrozou-pc0 bash]$ eval cat /etc/passwd $pipe wc -l
	30

这就是eval的用法。再来理解一下，**eval就是将所给的命令解析两遍**。

##最后

通过本文和之前的文章，我们几乎将所有的bash内建命令都覆盖到了。本文主要包括的知识点为：

1. bash脚本程序的输入输出。
2. bash的作业控制。
3. bash脚本的信号处理。
4. bash对进程的控制。
5. 命令行参数处理。
6. 使用内建命令改变bash相关环境。

希望这些内容对大家进一步深入了解bash编程有帮助。如果有相关问题，可以在我的微博、微信或者博客上联系我。

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

