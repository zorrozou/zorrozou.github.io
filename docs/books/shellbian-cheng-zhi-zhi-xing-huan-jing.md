# SHELL编程之执行环境

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

本文是shell编程系列的第三篇，主要介绍bash脚本的执行环境以及注意事项。通过本文，应该可以帮助您解决以下问题：

1. 执行bash和执行sh究竟有什么区别？
2. 如何调试bash脚本？
3. 如何记录用户在什么时候执行的某条命令？
4. 为什么有时ulimit命令的设置不生效或者报错？
5. 环境变量和一般变量有什么区别？？

## 常用参数

### 交互式login shell

关于bash的编程环境，首先我们要先理解的就是bash的参数。不同方式启动的bash一般默认的参数是不一样的。一般在命令行中使用的bash，都是以login方式打开的，对应的参数是：-l或—login。还有-i参数，表示bash是以交互方式打开的，在默认情况下，不加任何参数的bash也是交互方式打开的。这两种方式都会在启动bash之前加载一些文件：

首先，bash去检查/etc/profile文件是否存在，如果存在就读取并执行这个文件中的命令。

之后，bash再按照以下列出的文件顺序依次查看是否存在这些文件，如果任何一个文件存在，就读取、执行文件中的命令：

1. ~/.bash_profile
2. ~/.bash_login
3. ~/.profile

这里要注意的是，本步骤只会检查到一个文件并处理，即使同时存在2个或3个文件，本步骤也只会处理最优先的那个文件，而忽略其他文件。以上两个步骤的检查都可以用—noprofile参数进行关闭。

当bash是以login方式登录的时候，在bash退出时（exit），会额外读取并执行~/.bash_logout文件中的命令。

当bash是以交互方式登录时（-i参数），bash会读取并执行~/.bashrc中的命令。—norc参数可以关闭这个功能，另外还可以通过—rcfile参数指定一个文件替代默认的~/.bashrc文件。

以上就是bash以login方式和交互式方式登录的主要区别，根据这个过程，我们到RHEL7的环境上看看都需要加载哪些配置：

1. 首先是加载/etc/profile。根据RHEL7上此文件内容，这个脚本还需要去检查/etc/profile.d/目录，将里面以.sh结尾的文件都加载一遍。具体细节可以自行查看本文件内容。
2. 之后是检查~/.bash_profile。这个文件中会加载~/.bashrc文件。
3. 之后是处理~/.bashrc文件。此文件主要功能是给bash环境添加一些alias，之后再加载/etc/bashrc文件。
4. 最后处理/etc/bashrc文件。这个过程并不是bash自身带的过程，而是在RHEL7系统中通过脚本调用实现。

了解了这些之后，如果你的bash环境不是在RHEL7系统上，也应该可以确定在自己环境中启动的bash到底加载了哪些配置文件。

### bash和sh

几乎所有人都知道bash有个别名叫sh，也就是说在一个脚本前面写!#/bin/bash和#!/bin/sh似乎没什么不同。但是下面我们要看看它们究竟有什么不同。

首先，第一个区别就是这两个文件并不是同样的类型。如果细心观察过这两个文件的话，大家会发现：

	[zorro@zorrozou-pc0 bash]$ ls -l /usr/bin/sh
	lrwxrwxrwx 1 root root 4 11月 24 04:20 /usr/bin/sh -> bash
	[zorro@zorrozou-pc0 bash]$ ls -l /usr/bin/bash
	-rwxr-xr-x 1 root root 791304 11月 24 04:20 /usr/bin/bash
	
sh是指向bash的一个符号链接。符号链接就像是快捷方式，那么执行sh就是在执行bash。这说明什么？说明这两个执行方式是等同的么？实际上并不是。我们都知道在程序中是可以获得自己执行命令的进程名称的，这个方法在bash编程中可以使用$0变量来实现，参见如下脚本：

	[zorro@zorrozou-pc0 bash]$ cat name.sh
	#!/bin/bash

	echo $0

	case $0 in
	    *name.sh)
	    echo "My name is name!"
	    ;;
	    *na.sh)
	    echo "My name is na" 
	    ;;
	    *)
	    echo "Name error!"
	    ;;
	esac

这个脚本直接执行的结果是：

	[zorro@zorrozou-pc0 bash]$ ./name.sh 
	./name.sh
	My name is name!

大家也能看到脚本中有个逻辑是，如果进程名字是以na.sh结尾，那么打印的内容不一样。我们如何能让同一个程序触发这段不同的逻辑呢？其实很简单，就是给这个脚本创建一个叫na.sh的符号链接：

	[zorro@zorrozou-pc0 bash]$ ln -s name.sh na.sh 
	[zorro@zorrozou-pc0 bash]$ ./na.sh 
	./na.sh
	My name is na

通过符号链接的方式改变进程名称是一种常见的编程技巧，我们可以利用这个办法让程序通过不同进程名触发不同处理逻辑。所以大家以后再遇到类似bash和sh这样的符号链接关系的进程时要格外注意它们的区别。在这里它们到底有什么区别呢？实际上bash的源代码中对以bash名称和sh名称执行的时候，会分别触发不同的逻辑，主要的逻辑区别是：以sh名称运行时，会相当于以—posix参数方式启动bash。这个方式跟一般方式的具体区别可以参见：http://tiswww.case.edu/php/chet/bash/POSIX。

我遇到过很多次因为不同文件名的处理逻辑不同而引发的问题。其中一次是因为posix模式和一般模式的ulimit -c设置不同导致的。ulimit -c参数可以设置进程出现coredump时产生的文件的大小限制。因为内存的页大多都是4k，所以一般core文件都是最小4k一个，当ulimit -c参数设置小于4k时，无法正常产生core文件。为了调试方便，我们的生产系统都开了ulimit -c限制单位为4。因为默认ulimit -c的限制单位是1k，ulimit -c 4就是4k，够用了。但是我们仍然发现部分服务器不能正常产生core文件，最后排查定位到，这些不能产生core文件的配置脚本只要将#!/bin/sh改为#!/bin/bash就可以正常产生core文件。于是郁闷之余，查阅了bash的处理代码，最终发现原来是这个坑导致的问题。原因是：在posix模式下，ulimit -c的参数单位不是1024，而是512。至于还有什么其他不同，在上述链接中都有说明。

###脚本调试

程序员对程序的调试工作是必不可少的，bash本身对脚本程序提供的调试手段不多，printf大法是必要技能之一，当然在bash中就是echo大法。另外就是bash的-v参数、-x参数和-n参数。

-v参数就是可视模式，它会在执行bash程序的时候将要执行的内容也打印出来，除此之外，并不改变bash执行的过程：

	[zorro@zorrozou-pc0 bash]$ cat arg.sh
	#!/bin/bash -v
	
	echo $0
	echo $1
	echo $2
	ls /123
	echo $3
	echo $4
	
	echo $#
	echo $*
	echo $?

执行结果是：

	[zorro@zorrozou-pc0 bash]$ ./arg.sh 111 222 333 444 555
	#!/bin/bash -v
	
	echo $0
	./arg.sh
	echo $1
	111
	echo $2
	222
	ls /123
	ls: cannot access '/123': No such file or directory
	echo $3
	333
	echo $4
	444
	
	echo $#
	5
	echo $*
	111 222 333 444 555
	echo $?
	0
	
-x参数是跟踪模式(xtrace)。可以跟踪各种语法的调用，并打印出每个命令的输出结果：

	[zorro@zorrozou-pc0 bash]$ cat arg.sh
	#!/bin/bash -x
	
	echo $0
	echo $1
	echo $2
	ls /123
	echo $3
	echo $4
	
	echo $#
	echo $*
	echo $?

执行结果为：

	[zorro@zorrozou-pc0 bash]$ ./arg.sh 111 222 333 444 555
	+ echo ./arg.sh
	./arg.sh
	+ echo 111
	111
	+ echo 222
	222
	+ ls /123
	ls: cannot access '/123': No such file or directory
	+ echo 333
	333
	+ echo 444
	444
	+ echo 5
	5
	+ echo 111 222 333 444 555
	111 222 333 444 555
	+ echo 0
	0

-n参数用来检查bash的语法错误，并且不会真正执行bash脚本。这个就不举例子了。另外，三种方式除了可以直接在bash后面加参数以外，还可以在程序中随时使用内建命令set打开和关闭，方法如下：

	[zorro@zorrozou-pc0 bash]$ cat arg.sh
	#!/bin/bash 

	set -v
	#set -o verbose
	echo $0
	set +v
	echo $1
	set -x
	#set -o xtrace
	echo $2
	ls /123
	echo $3
	set +x
	echo $4
	
	echo $#
	
	set -n
	#set -o noexec
	echo $*
	echo $?
	set +n

执行结果为：

	[zorro@zorrozou-pc0 bash]$ ./arg.sh 
	#set -o verbose
	echo $0
	./arg.sh
	set +v
	
	+ echo
	
	+ ls /123
	ls: cannot access '/123': No such file or directory
	+ echo
	
	+ set +x
	
	0

以上例子中顺便演示了1、3、#、?的意义，大家可以自行对比它们的区别以理解参数的意义。另外再补充一个-e参数，这个参数可以让bash脚本命令执行错误的时候直接退出，而不是继续执行。这个功能在某些调试的场景下非常有用！

本节只列出了几个常用的参数的意义和使用注意事项，希望可以起到抛砖引玉的作用。大家如果想要学习更多的bash参数，可以自行查看bash的man手册，并详细学习set和shopt命令的使用方法。

###环境变量

我们目前已经知道有个PATH变量，bash会在查找外部命令的时候到PATH所记录的目录中进行查找，从这个例子我们可以先理解一下环境变量的作用。环境变量就类似PATH这种变量，是bash预设好的一些可能会对其状态和行为产生影响的变量。bash中实现的环境变量个数大概几十个，所有的帮助说明都可以在man bash中找到。我们还是拿一些会在bash编程中经常用到的来讲解一下。

我们可以使用env命令来查看当前bash已经定义的环境变量。set命令不加任何参数可以查看当前bash环境中的所有变量，包括环境变量和私有的一般变量。一般变量的定义方法：

	[zorro@zorrozou-pc0 ~]$ aaa=1000
	[zorro@zorrozou-pc0 ~]$ echo $aaa
	1000
	[zorro@zorrozou-pc0 ~]$ env|grep aaa
	[zorro@zorrozou-pc0 ~]$ set|grep aaa
	aaa=1000

上面我们定义了一个变量名字叫做aaa，我们能看到在set命令中可以显示出这个变量，但是env不显示。export命令可以将一个一般变量编程环境变量。

	[zorro@zorrozou-pc0 ~]$ export aaa
	[zorro@zorrozou-pc0 ~]$ env|grep aaa
	aaa=1000
	[zorro@zorrozou-pc0 ~]$ set|grep aaa
	aaa=1000

export之后，env和set都能看到这个变量了。一般变量和环境变量的区别是：一般变量不能被子进程继承，而环境变量会被子进程继承。

	[zorro@zorrozou-pc0 ~]$ env|grep aaa
	aaa=1000
	[zorro@zorrozou-pc0 ~]$ bbb=2000
	[zorro@zorrozou-pc0 ~]$ echo $bbb
	2000
	[zorro@zorrozou-pc0 ~]$ echo $aaa
	1000
	[zorro@zorrozou-pc0 ~]$ env|grep bbb
	[zorro@zorrozou-pc0 ~]$ bash
	[zorro@zorrozou-pc0 ~]$ echo $aaa
	1000
	[zorro@zorrozou-pc0 ~]$ echo $bbb
	
	[zorro@zorrozou-pc0 ~]$ 

上面测试中，我们的bash环境里有一个环境变量aaa＝1000，又定义了一个一般变量bbb＝2000。此时我们在用bash打开一个子进程，在子进程中我们发现，aaa变量仍然能取到值，但是bbb不可以。证明aaa可以被子进程继承，bbb不可以。

搞清楚了环境变量的基础知识之后，再来看一下bash中常用的环境变量：

进程自身信息相关

BASH：当前bash进程的进程名。

BASHOPTS：记录了shopt命令已经设置为打开的选项。

BASH_VERSINFO：bash的版本号信息，是一个数组。可以使用命令：echo ${BASH_VERSINFO[*]}查看数组的信息。有关数组的操作我们会在其它文章里详细说明。

BASH_VERSION：bash的版本号信息。比上一个信息更少一点。

HOSTNAME：系统主机名信息。

HOSTTYPE：系统类型信息。

OLDPWD：上一个当前工作目录。

PWD：当前工作目录。

HOME：主目录。一般指进程uid对应用户的主目录。

SHELL：bash程序所在路径。

常用数字

RANDOM：每次取这个变量的值都能得到一个0-32767的随机数。

SECONDS：当前bash已经开启了多少秒。

BASHPID：当前bash进程的PID。

EUID：进程的有效用户id。

GROUPS：进程组身份。

PPID：父进程PID。

UID：用户uid。

提示符

PS1：用户bash的交互提示符，主提示符。

PS2：第二提示符，主要用在一些除了PS1之外常见的提示符场景，比如输入了’之后回车，就能看到这个提示符。

PS3：用于select语句的交互提示符。

PS4：用于跟踪执行过程时的提示符，一般显示为”+”。比如我们在bash中使用set -x之后的跟踪提示就是这个提示符显示的。

###命令历史

交互bash中提供一种方便追溯曾经使用的命令的功能，叫做命令历史功能。就是将曾经用过的命令纪录下来，以备以后查询或者重复调用。这个功能在交互方式的bash中默认打开，在bash编程环境中默认是没有开启的。可以使用set +H来关闭这个功能，set -H打开这个功能。在开启了history功能的bash中我们可以使用history内建命令查询当前的命令历史列表：

	[zorro@zorrozou-pc0 bash]$ history 
	    1  sudo bash
	    2  ps ax
	    3  ls
	    4  ip ad sh

命令历史的相关配置都是通过bash的环境变量来完成的：

HISTFILE：记录命令历史的文件路径。

HISTFILESIZE：命令历史文件的行数限制

HISTCONTROL：这个变量可以用来控制命令历史的一些特性。比如一般的命令历史会完全按照我们执行命令的顺序来完整记录，如果我们连续执行相同的命令，也会重复记录，如：

	[zorro@zorrozou-pc0 bash]$ pwd
	/home/zorro/bash
	[zorro@zorrozou-pc0 bash]$ pwd
	/home/zorro/bash
	[zorro@zorrozou-pc0 bash]$ pwd
	/home/zorro/bash
	[zorro@zorrozou-pc0 bash]$ history 
	......
	 1173  pwd
	 1174  pwd
	 1175  pwd
	 1176  history 

我们可以利用这个变量的配置来消除命令历史中的重复记录：

	[zorro@zorrozou-pc0 bash]$ export HISTCONTROL=ignoredups
	[zorro@zorrozou-pc0 bash]$ pwd
	/home/zorro/bash
	[zorro@zorrozou-pc0 bash]$ pwd
	/home/zorro/bash
	[zorro@zorrozou-pc0 bash]$ pwd
	/home/zorro/bash
	[zorro@zorrozou-pc0 bash]$ history 
	 1177  export HISTCONTROL=ignoredups
	 1178  history 
	 1179  pwd
	 1180  history 

这个变量还有其它配置，ignorespace可以用来让history忽略以空格开头的命令，ignoreboth可以同时起到ignoredups和ignorespace的作用，

HISTIGNORE：可以控制history机制忽略某些命令，配置方法：

	export HISTIGNORE=”pwd:ls:cd:”。

HISTSIZE：命令历史纪录的命令个数。

HISTTIMEFORMAT：可以用来定义命令历史纪录的时间格式.在命令历史中记录命令执行时间有时候很有用，配置方法：

	export HISTTIMEFORMAT='%F %T '

相关时间格式的帮助可以查看man 3 strftime。

HISTCMD：当前命令历史的行数。

在交互式操作bash的时候，可以通过一些特殊符号对命令历史进行快速调用，这些符号基本都是以!开头的，除非!后面跟的是空格、换行、等号=或者小括号()：

!n：表示引用命令历史中的第n条命令，如：!123，执行第123条命令。

!-n：表示引用命令历史中的倒数第n条命令，如：!-123，执行倒数第123条命令。

!!：重复执行上一条命令。

!string：在命令历史中找到最近的一条以string字符串开头的命令并执行。

!?string[?]：在命令历史中找到最近的一条包括string字符的命令并执行。如果最有一个?省略的话，就是找到以string结尾的命令。

^string1^string2^：将上一个命令中的string1字符串替换成string2字符串并执行。可以简写为：^string1^string2

!#：重复当前输入的命令。

以下符号可以作为某个命令的单词代号，如：

^：!^表示上一条命令中的第一个参数，$123^表示第123条命令的第一个参数。

$：!$表示上一条命令中的最后一个参数。!123$表示第123条命令的最后一个参数。

n（数字）：!!0表示上一条命令的命令名，!!3上一条命令的第三个参数。!123:3第123条命令的第三个参数。

：表示所有参数，如：!123:\或!123*

x-y：x和y都是数字，表示从第x到第y个参数，如：!123:1-6表示第123条命令的第1个到第6个参数。只写成-y，取前y个，如：!123:-7表示0-7。

x：表示取从第x个参数之后的所有参数，相当于x-$。如：!123:2\

x-：表示取从第x个参数之后的所有参数，不包括最后一个。如：!123:2-

选择出相关命令或者参数之后，我们还可以通过一些命令对其进行操作：

h 删除所有后面的路径，只留下前面的

	[zorro@zorrozou-pc0 bash]$ ls /etc/passwd
	/etc/passwd
	[zorro@zorrozou-pc0 bash]$ !!:h
	ls /etc
	...

t 删除所有前面的路径，只留下后面的

	[zorro@zorrozou-pc0 bash]$ !-2:t
	passwd

紧接着上面的命令执行，相当于运行passwd。

r 删除后缀.xxx, 留下文件名

	[zorro@zorrozou-pc0 bash]$ ls 123.txt
	ls: cannot access '123.txt': No such file or directory
	[zorro@zorrozou-pc0 bash]$ !!:r
	ls 123

e 删除文件名, 留下后缀

	[zorro@zorrozou-pc0 bash]$ !-2:e
	.txt
	bash: .txt: command not found

p 只打印结果命令，但不执行

	[zorro@zorrozou-pc0 bash]$ ls /etc/passwd
	/etc/passwd
	[zorro@zorrozou-pc0 bash]$ !!:p
	ls /etc/passwd

q 防止代换参数被再次替换，相当于给选择的参数加上了’’，以防止其被转义。

	[zorro@zorrozou-pc0 bash]$ ls `echo /etc/passwd`
	/etc/passwd
	[zorro@zorrozou-pc0 bash]$ !!:q
	'ls `echo /etc/passwd`'
	-bash: ls `echo /etc/passwd`: No such file or directory

x 作用同上，区别是每个参数都会分别给加上’’。如：

	[zorro@zorrozou-pc0 bash]$ !-2:x
	'ls' '`echo' '/etc/passwd`'
	ls: cannot access '`echo': No such file or directory
	ls: cannot access '/etc/passwd`': No such file or directory

s/old/new/ 字符串替换，跟上面的^^类似，但是可以指定任意历史命令。只替换找到的第一个old字符串。
& 重复上次替换
g 在执行s或者＆命令作为前缀使用，表示全局替换。

##资源限制

每一个进程环境中都有对于资源的限制，bash脚本也不例外。我们可以使用ulimit内建命令查看和设置bash环境中的资源限制。

	[zorro@zorrozou-pc0 ~]$ ulimit -a
	core file size          (blocks, -c) unlimited
	data seg size           (kbytes, -d) unlimited
	scheduling priority             (-e) 0
	file size               (blocks, -f) unlimited
	pending signals                 (-i) 63877
	max locked memory       (kbytes, -l) 64
	max memory size         (kbytes, -m) unlimited
	open files                      (-n) 1024
	pipe size            (512 bytes, -p) 8
	POSIX message queues     (bytes, -q) 819200
	real-time priority              (-r) 0
	stack size              (kbytes, -s) 8192
	cpu time               (seconds, -t) unlimited
	max user processes              (-u) 63877
	virtual memory          (kbytes, -v) unlimited
	file locks                      (-x) unlimited

在上文讲述bash和sh之间的区别时，我们已经接触过这个命令中的-c参数了，用来限制core文件的大小。我们再来看看其它参数的含义：

data seg size：程序的数据段限制。

scheduling priority：优先级限制。相关概念的理解可以参考这篇：http://wp.me/p79Cit-S

file size：文件大小限制。

pending signals：未决信号个数限制。

max locked memory：最大可以锁内存的空间限制。

max memory size：最大物理内存使用限制。

open files：文件打开个数限制。

pipe size：管道空间限制。

POSIX message queues：POSIX消息队列空间限制。

real-time priority：实时优先级限制。相关概念的理解可以参考这篇：http://wp.me/p79Cit-S

stack size：程序栈空间限制。

cpu time：占用CPU时间限制。

max user processes：可以打开的的进程个数限制。

virtual memory：虚拟内存空间限制。

file locks：锁文件个数限制。

以上参数涉及各方面的相关知识，我们在此就不详细描述这些相关内容了。在此我们主要关注open files和max user processes参数，这两个参数是我们在优化系统时最常用的两个参数。

这里需要注意的是，使用ulimit命令配置完这些参数之后的bash产生的子进程都会继承父进程的相关资源配置。ulimit的资源配置的继承关系类似环境变量，父进程的配置变化可以影响子进程。所以，如果我们只是在某个登录shell或者交互式shell中修改了ulimit配置，那么在这个bash环境中执行的命令和产生的子进程都会受到影响，但是对整个系统的其它进程没有影响。如果我们想要让所有用户一登录就有相关的配置，可以考虑把ulimit命令写在bash启动的相关脚本中，如/etc/profile。如果只想影响某一个用户，可以写在这个用户的主目录的bash启动脚本中，如~/.bash_profile。系统的pam模块也给我们提供了配置ulimit相关限制的配置方法，在centos7中大家可以在以下目录和文件中找到相关配置：

	[zorro@zorrozou-pc0 bash]$ ls /etc/security/limits.d/
	10-gcr.conf  99-audio.conf
	[zorro@zorrozou-pc0 bash]$ ls /etc/security/limits.conf 
	/etc/security/limits.conf

即使是写在pam相关配置文件中的相关配置，也可能不是系统全局的。如果你想给某一个后台进程设置ulimit，最靠谱的办法还是在它的启动脚本中进行配置。无论如何，只要记得一点，如果相关进程的ulimit没生效，要想的是它的父进程是谁？它的父进程是不是生效了？

ulimit参数中绝大多数配置都是root才有权限改的更大，而非root身份只能在现有的配置基础上减小限制。如果你执行ulimit的时候报错了，请注意是不是这个原因。

##最后

通过本文我们学习了bash编程的进程环境的相关内容，主要包括的知识点为：

1. bash的常用参数。
2. bash的环境变量。
3. 命令历史功能和相关变量配置。
4. bash脚本的资源限制ulimit的使用。

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


