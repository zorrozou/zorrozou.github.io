# SHELL编程之特殊符号

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

本文是shell编程系列的第四篇，集中介绍了bash编程可能涉及到的特殊符号的使用。**学会本文内容可以帮助你写出天书一样的bash脚本**，并且顺便解决以下问题：

1. 输入输出重定向是什么原理？
2. exec 3<> /tmp/filename是什么鬼？
3. 你玩过bash的关联数组吗？
4. 如何不用if判断变量是否被定义？
5. 脚本中字符串替换和删除操作不用sed怎么做？
6. " "和' '有什么不同？
7. 正则表达式和bash通配符是一回事么？

这里需要额外注意的是，相同的符号出现在不同的上下文中可能会有不同的含义。我们会在后续的讲解中突出它们的区别。

##重定向(REDIRECTION)

重定向也叫输入输出重定向。我们先通过基本的使用对这个概念有个感性认识。

**输入重定向**

大家应该都用过cat命令，可以输出一个文件的内容。如：cat /etc/passwd。如果不给cat任何参数，那么cat将从键盘（标准输入）读取用户的输入，直接将内容显示到屏幕上，就像这样：

	[zorro@zorrozou-pc0 bash]$ cat
	hello 
	hello
	I am zorro!
	I am zorro!

可以通过输入重定向让cat命令从别的地方读取输入，显示到当前屏幕上。最简单的方式是输入重定向一个文件，不过这不够“神奇”，我们让cat从别的终端读取输入试试。我当前使用桌面的终端terminal开了多个bash，使用ps命令可以看到这些终端所占用的输入文件是哪个：

	[zorro@zorrozou-pc0 bash]$ ps ax|grep bash
	 4632 pts/0    Ss     0:00 -bash
	 5087 pts/2    S+     0:00 man bash
	 5897 pts/1    Ss     0:00 -bash
	 5911 pts/2    Ss     0:00 -bash
	 9071 pts/4    Ss     0:00 -bash
	11667 pts/3    Ss+    0:00 -bash
	16309 pts/4    S+     0:00 grep --color=auto bash
	19465 pts/2    S      0:00 sudo bash
	19466 pts/2    S      0:00 bash

通过第二列可以看到，不同的bash所在的终端文件是哪个，这里的pts/3就意味着这个文件放在/dev/pts/3。我们来试一下，在pts/2对应的bash中输入：

	[zorro@zorrozou-pc0 bash]$ cat < /dev/pts/3 
	

然后切换到pts/3所在的bash上敲入字符串，在pts/2的bash中能看见相关字符：

	[zorro@zorrozou-pc0 bash]$ cat < /dev/pts/3 
	safsdfsfsfadsdsasdfsafadsadfd

这只是个输入重定向的例子，一般我们也可以直接cat < /etc/passwd，表示让cat命令不是从默认输入读取，而是从/etc/passwd读取，这就是输入重定向，使用"<"。

**输出重定向**

绝大多数命令都有输出，用来显示给人看，所以输出基本都显示在屏幕（终端）上。有时候我们不想看到，就可以把输出重定向到别的地方：

	[zorro@zorrozou-pc0 bash]$ ls /
	bin  boot  cgroup  data  dev  etc  home  lib  lib64  lost+found  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var
	[zorro@zorrozou-pc0 bash]$ ls / > /tmp/out
	[zorro@zorrozou-pc0 bash]$ cat /tmp/out
	bin
	boot
	cgroup
	data
	dev
	......

使用一个">"，将原本显示在屏幕上的内容给输出到了/tmp/out文件中。这个功能就是输出重定向。

**报错重定向**

命令执行都会遇到错误，一般也都是给人看的，所以默认还是显示在屏幕上。这些输出使用">"是不能进行重定向的：

	[zorro@zorrozou-pc0 bash]$ ls /1234 > /tmp/err
	ls: cannot access '/1234': No such file or directory

可以看到，报错还是显示在了屏幕上。如果想要重定向这样的内容，可以使用"2>"：

	[zorro@zorrozou-pc0 bash]$ ls /1234 2> /tmp/err
	[zorro@zorrozou-pc0 bash]$ cat /tmp/err
	ls: cannot access '/1234': No such file or directory

以上就是常见的输入输出重定向。在进行其它技巧讲解之前，我们有必要理解一下重定向的本质，所以要先从文件描述符说起。

###文件描述符(file descriptor)

文件描述符简称fd，它是一个抽象概念，在很多其它体系下，它可能有其它名字，比如在C库编程中可以叫做文件流或文件流指针，在其它语言中也可以叫做文件句柄（handler），而且这些不同名词的隐含意义可能是不完全相同的。不过在系统层，还是应该使用系统调用中规定的名词，我们统一把它叫做文件描述符。

文件描述符本质上是一个数组下标（C语言数组）。在内核中，这个数组是用来管理一个进程打开的文件的对应关系的数组。就是说，对于任何一个进程来说，都有这样一个数组来管理它打开的文件，数组中的每一个元素和文件是映射关系，即：一个数组元素只能映射一个文件，而一个文件可以被多个数组元素所映射。

>其实上面的描述并不完全准确，在内核中，文件描述符的数组所直接映射的实际上是文件表，文件表再索引到相关文件的v_node。具体可以参见《UNIX系统高级编程》。

shell在产生一个新进程后，新进程的前三个文件描述符都默认指向三个相关文件。这三个文件描述符对应的数组下标分别为0，1，2。0对应的文件叫做标准输入（stdin），1对应的文件叫做标准输出（stdout），2对应的文件叫做标准报错(stderr)。但是实际上，默认跟人交互的输入是键盘、鼠标，输出是显示器屏幕，这些硬件设备对于程序来说都是不认识的，所以操作系统借用了原来“终端”的概念，将键盘鼠标显示器都表现成一个终端文件。于是stdin、stdout和stderr就最重都指向了这所谓的终端文件上。于是，从键盘输入的内容，进程可以从标准输入的0号文件描述符读取，正常的输出内容从1号描述符写出，报错信息被定义为从2号描述符写出。这就是标准输入、标准输出和标准报错对应的描述符编号是0、1、2的原因。这也是为什么对报错进行重定向要使用2>的原因(其实1>也是可以用的)。

明白了以上内容之后，很多重定向的数字魔法就好理解了，比如：

	[zorro@zorrozou-pc0 prime]$ find /etc -name passwd > /dev/null 
	find: ‘/etc/docker’: Permission denied
	find: ‘/etc/sudoers.d’: Permission denied
	find: ‘/etc/lvm/cache’: Permission denied
	find: ‘/etc/pacman.d/gnupg/openpgp-revocs.d’: Permission denied
	find: ‘/etc/pacman.d/gnupg/private-keys-v1.d’: Permission denied
	find: ‘/etc/polkit-1/rules.d’: Permission denied

这相当于只看报错信息。

	[zorro@zorrozou-pc0 prime]$ find /etc -name passwd 2> /dev/null 
	/etc/default/passwd
	/etc/pam.d/passwd
	/etc/passwd

这相当于只看正确输出信息。

	[zorro@zorrozou-pc0 prime]$ find /etc -name passwd &> /dev/null

所有输出都不看，也可以写成">&"。

	[zorro@zorrozou-pc0 prime]$ find /etc -name passwd 2>&1
	/etc/default/passwd
	find: ‘/etc/docker’: Permission denied
	/etc/pam.d/passwd
	find: ‘/etc/sudoers.d’: Permission denied
	find: ‘/etc/lvm/cache’: Permission denied
	find: ‘/etc/pacman.d/gnupg/openpgp-revocs.d’: Permission denied
	find: ‘/etc/pacman.d/gnupg/private-keys-v1.d’: Permission denied
	find: ‘/etc/polkit-1/rules.d’: Permission denied
	/etc/passwd

将标准报错输出的，重定向到标准输出再输出。

	[zorro@zorrozou-pc0 prime]$ echo hello > /tmp/out 
	[zorro@zorrozou-pc0 prime]$ cat /tmp/out
	hello
	[zorro@zorrozou-pc0 prime]$ echo hello2 >> /tmp/out 
	[zorro@zorrozou-pc0 prime]$ cat /tmp/out
	hello
	hello2

">>"表示追加重定向。

相信大家对&>>、1>&2、？2>&3、6>&8、>>file 2>&1这样的写法应该也都能理解了。进程可以打开多个文件，多个描述符之间都可以进行重定向。当然，输入也可以，比如：3<表示从描述符3读取。下面我们罗列一下其他重定向符号和用法：

**Here Document**：

语法：

	<<[-]word
		here-document
	delimiter

这是一种特殊的输入重定向，重定向的内容并不是来自于某个文件，而是从当前输入读取，直到输入中写入了delimiter字符标记结束。用法：

	[zorro@zorrozou-pc0 prime]$ cat << EOF
	> hello world!
	> I am zorro
	> 
	> 
	> 
	> sadfsdf
	> ertert
	> eof
	> EOF
	hello world!
	I am zorro



	sadfsdf
	ertert
	eof

这个例子可以看到，最后cat输出的内容都是在上面写入的内容，而且内容中不包括EOF，因为EOF是标记输入结束的字符串。这个功能在脚本中通常可以用于需要交互式处理的某些命令的输入和文件编辑，比如想在脚本中使用fdisk命令新建一个分区：

	[root@zorrozou-pc0 prime]# cat fdisk.sh 
	#!/bin/bash

	fdisk /dev/sdb << EOF
	n
	p
	
	
	w
	EOF

当然这个脚本大家千万不要乱执行，可能会修改你的分区表。其中要输入的内容，相信熟悉fdisk命令的人应该都能明白，我就不多解释了。

**Here strings**：

语法：

	<<<word

使用方式：

	[zorro@zorrozou-pc0 prime]$ cat <<< asdasdasd
	asdasdasd

其实就是将<<<符号后面的字符串当成要输入的内容给cat，而不是定向一个文件描述符。这样是不是就相当于把cat当echo用了？

**文件描述符的复制**：

复制输入文件描述符：[n]<&word

如果n没有指定数字，则默认复制0号文件描述符。word一般写一个已经打开的并且用来作为输入的描述符数字，表示将制订的n号描述符在制定的描述符上复制一个。如果word写的是“-”符号，则表示关闭这个文件描述符。如果word指定的不是一个用来输入的文件描述符，则会报错。

复制输出文件描述符：[n]>&word

复制一个输出的描述符，字段描述参考上面的输入复制，例子上面已经讲过了。这里还需要知道的就是1>&-表示关闭1号描述符。

**文件描述符的移动**：

移动输入描述符：[n]<&digit-

移动输出描述符：[n]>&digit-

这两个符号的意思都是将原有描述符在新的描述符编号上打开，并且关闭原有描述符。

**描述符新建**：

新建一个用来输入的描述符：[n]<word

新建一个用来输出的描述符：[n]>word

新建一个用来输入和输出的描述符：[n]<>word

word都应该写一个文件路径，用来表示这个文件描述符的关联文件是谁。

下面我们来看相关的编程例子：

	#!/bin/bash

	# example 1
	#打开3号fd用来输入，关联文件为/etc/passwd
	exec 3< /etc/passwd
	#让3号描述符成为标准输入
	exec 0<&3
	#此时cat的输入将是/etc/passwd，会在屏幕上显示出/etc/passwd的内容。
	cat

	#关闭3号描述符。
	exec 3>&-

	# example 2
	#打开3号和4号描述符作为输出，并且分别关联文件。
	exec 3> /tmp/stdout

	exec 4> /tmp/stderr

	#将标准输入关联到3号描述符，关闭原来的1号fd。
	exec 1>&3-
	#将标准报错关联到4号描述符，关闭原来的2号fd。
	exec 2>&4-

	#这个find命令的所有正常输出都会写到/tmp/stdout文件中，错误输出都会写到/tmp/stderr文件中。
	find /etc/ -name "passwd"

	#关闭两个描述符。
	exec 3>&-
	exec 4>&-
	
以上脚本要注意的地方是，**一般输入输出重定向都是放到命令后面作为后缀使用，所以如果单纯改变脚本的描述符，需要在前面加exec命令**。这种用法也叫做描述符魔术。某些特殊符号还有一些特殊用法，比如：

	zorro@zorrozou-pc0 bash]$ > /tmp/out
	
表示清空文件，当然也可以写成：

	[zorro@zorrozou-pc0 bash]$ :> /tmp/out

因为":"是一个内建命令，跟true是同样的功能，所以没有任何输出，所以这个命令清空文件的作用。

##脚本参数处理

我们在之前的例子中已经简单看过相关参数处理的特殊符号了，再来看一下：

	[zorro@zorrozou-pc0 bash]$ cat arg1.sh 
	#!/bin/bash

	echo $0
	echo $1
	echo $2
	echo $3
	echo $4
	echo $#
	echo $*
	echo $?

执行结果：

	[zorro@zorrozou-pc0 bash]$ ./arg1.sh 111 222 333 444
	./arg1.sh
	111
	222
	333
	444
	4
	111 222 333 444
	0

可以罗列一下：

**$0**：命令名。

**$n**：n是一个数字，表示第n个参数。

**$#**：参数个数。

**$\***：所有参数列表。

**$@**：同上。

实际上大家可以认为上面的0,1,2,3,#,*,@,?都是一堆变量名。跟aaa＝1000定义的变量没什么区别，只是他们有特殊含义。所以$@实际上就是对@变量取值，跟$aaa概念一样。所以上述所有取值都可以写成${}的方式，因为bash中对变量取值有两种写法，另外一种是${aaa}。这种写法的好处是对变量名字可以有更明确的界定，比如：

	[zorro@zorrozou-pc0 bash]$ aaa=1000
	[zorro@zorrozou-pc0 bash]$ echo $aaa
	1000
	[zorro@zorrozou-pc0 bash]$ echo $aaa0
	
	[zorro@zorrozou-pc0 bash]$ echo ${aaa}0
	10000

内建命令shift可以用来对参数进行位置处理，它会将所有参数都左移一个位置，可以用来进行参数处理。使用例子如下：

	[zorro@zorrozou-pc0 ~]$ cat shift.sh
	#!/bin/bash
	
	if [ $# -lt 1 ]
	then
		echo "Argument num error!" 1>&2
		echo "Usage ....." 1>&2
		exit
	fi
	
	while ! [ -z $1 ]
	do
		echo $1
		shift
	done
	
执行效果：

	[zorro@zorrozou-pc0 bash]$ ./shift.sh 111 222 333 444 555 666
	111
	222
	333
	444
	555
	666

其他的特殊变量还有：

**$?**：上一个命令的返回值。

**$$**：当前shell的PID。

**$!**：最近一个被放到后台任务管理的进程PID。如：

	[zorro@zorrozou-pc0 tmp]$ sleep 3000 &
	[1] 867
	[zorro@zorrozou-pc0 tmp]$ echo $!
	867

**$-**：列出当前bash的运行参数，比如set -v或者-i这样的参数。

**$_**："\_"算是所有特殊变量中最诡异的一个了，在bash脚本刚开始的时候，它可以取到脚本的完整文件名。当执行完某个命令之后，它可以取到，这个命令的最后一个参数。当在检查邮件的时候，这个变量帮你保存当前正在查看的邮件名。

##数组操作

bash中可以定义数组，使用方法如下：

	[zorro@zorrozou-pc0 bash]$ cat array.sh
	#!/bin/bash
	#定义一个一般数组
	declare -a array
	
	#为数组元素赋值
	array[0]=1000
	array[1]=2000
	array[2]=3000
	array[3]=4000
	
	#直接使用数组名得出第一个元素的值
	echo $array
	#取数组所有元素的值
	echo ${array[*]}
	echo ${array[@]}
	#取第n个元素的值
	echo ${array[0]}
	echo ${array[1]}
	echo ${array[2]}
	echo ${array[3]}
	#数组元素个数
	echo ${#array[*]}
	#取数组所有索引列表
	echo ${!array[*]}
	echo ${!array[@]}
	
	#定义一个关联数组
	declare -A assoc_arr
	
	#为关联数组复制
	assoc_arr[zorro]='zorro'
	assoc_arr[jerry]='jerry'
	assoc_arr[tom]='tom'
	
	#所有操作同上
	echo $assoc_arr
	echo ${assoc_arr[*]}
	echo ${assoc_arr[@]}
	echo ${assoc_arr[zorro]}
	echo ${assoc_arr[jerry]}
	echo ${assoc_arr[tom]}
	echo ${#assoc_arr[*]}
	echo ${!assoc_arr[*]}
	echo ${!assoc_arr[@]}

##命令行扩展

###大括号扩展

用类似枚举的方式创建一些目录：

	[zorro@zorrozou-pc0 bash]$ mkdir -p test/zorro/{a,b,c,d}{1,2,3,4}
	[zorro@zorrozou-pc0 bash]$ ls test/zorro/
	a1  a2  a3  a4  b1  b2  b3  b4  c1  c2  c3  c4  d1  d2  d3  d4

可能还有这样用的：

	[zorro@zorrozou-pc0 bash]$ mv test/{a,c}.conf

这个命令的意思是：mv test/a.conf test/c.conf

###~符号扩展

**～**：在bash中一般表示用户的主目录。cd ~表示回到主目录。cd ~zorro表示回到zorro用户的主目录。

###变量扩展

我们都知道取一个变量值可以用$或者${}。在使用${}的时候可以添加很多对变量进行扩展操作的功能，下面我们就分别来看看。

${aaa:-1000}

这个表示如果变量aaa是空值或者没有赋值，则此表达式取值为1000，aaa变量不被更改，以后还是空。如果aaa已经被赋值，则原值不变：

	[zorro@zorrozou-pc0 bash]$ echo $aaa
	
	[zorro@zorrozou-pc0 bash]$ echo ${aaa:-1000}
	1000
	[zorro@zorrozou-pc0 bash]$ echo $aaa
	[zorro@zorrozou-pc0 bash]$ aaa=2000
	[zorro@zorrozou-pc0 bash]$ echo $aaa
	2000
	[zorro@zorrozou-pc0 bash]$ echo ${aaa:-1000}
	2000
	[zorro@zorrozou-pc0 bash]$ echo $aaa
	2000

${aaa:=1000}

跟上面的表达式的区别是，如果aaa未被赋值，则赋值成＝后面的值，其他行为不变：

	[zorro@zorrozou-pc0 bash]$ echo $aaa
	
	[zorro@zorrozou-pc0 bash]$ echo ${aaa:=1000}
	1000
	[zorro@zorrozou-pc0 bash]$ echo $aaa
	1000

${aaa:?unset}

判断变量是否为定义或为空，如果符合条件，就提示？后面的字符串。

	[zorro@zorrozou-pc0 bash]$ echo ${aaa:?unset}
	-bash: aaa: unset
	[zorro@zorrozou-pc0 bash]$ aaa=1000
	[zorro@zorrozou-pc0 bash]$ echo ${aaa:?unset}
	1000

${aaa:?unset}

如果aaa为空或者未设置，则什么也不做。如果已被设置，则取?后面的值。并不改变原aaa值：

	[zorro@zorrozou-pc0 bash]$ aaa=1000
	[zorro@zorrozou-pc0 bash]$ echo ${aaa:+unset}
	unset
	[zorro@zorrozou-pc0 bash]$ echo $aaa
	1000
	
${aaa:10}

取字符串偏移量，表示取出aaa变量对应字符串的第10个字符之后的字符串，变量原值不变。

	[zorro@zorrozou-pc0 bash]$ aaa='/home/zorro/zorro.txt'
	[zorro@zorrozou-pc0 bash]$ echo ${aaa:10}
	o/zorro.txt

${aaa:10:15}

第二个数字表示取多长：

	[zorro@zorrozou-pc0 bash]$ echo ${aaa:10:5}
	o/zor

${!B*}

${!B@}

取出所有以B开头的变量名（请注意他们跟数组中相关符号的差别）：

	[zorro@zorrozou-pc0 bash]$ echo ${!B*}
	BASH BASHOPTS BASHPID BASH_ALIASES BASH_ARGC BASH_ARGV BASH_CMDS BASH_COMMAND BASH_LINENO BASH_SOURCE BASH_SUBSHELL BASH_VERSINFO BASH_VERSION

${#aaa}

取变量长度：

	[zorro@zorrozou-pc0 bash]$ echo ${#aaa}
	21

${parameter#word}

变量paramenter看做字符串从左往右找到第一个word，取其后面的字串：

	[zorro@zorrozou-pc0 bash]$ echo ${aaa#/}
	home/zorro/zorro.txt

这里需要注意的是，word必须是一个路径匹配的字符串，比如：

	[zorro@zorrozou-pc0 bash]$ echo ${aaa#*zorro}
	/zorro.txt

这个表示删除路径中匹配到的第一个zorro左边的所有字符，而这样是无效的：

	[zorro@zorrozou-pc0 bash]$ echo ${aaa#zorro}
	/home/zorro/zorro.txt

因为此时zorro不是一个路径匹配。另外，这个表达式只能删除匹配到的左边的字符串，保留右边的。

${parameter##word}

这个表达式与上一个的区别是，匹配的不是第一个符合条件的word，而是最后一个：

	[zorro@zorrozou-pc0 bash]$ echo ${aaa##*zorro}
	.txt
	[zorro@zorrozou-pc0 bash]$ echo ${aaa##*/}
	zorro.txt

${parameter%word}
${parameter%%word}

这两个符号相对于上面两个相当于#号换成了%号，操作区别也从匹配删除左边的字符变成了匹配删除右边的字符，如：

	[zorro@zorrozou-pc0 bash]$ echo ${aaa%/*}
	/home/zorro
	[zorro@zorrozou-pc0 bash]$ echo ${aaa%t}
	/home/zorro/zorro.tx
	[zorro@zorrozou-pc0 bash]$ echo ${aaa%.*}
	/home/zorro/zorro
	[zorro@zorrozou-pc0 bash]$ echo ${aaa%%z*}
	/home/

以上#号和%号分别是匹配删除哪边的，容易记不住。不过有个窍门是，可以看看他们分别在键盘上的$的哪边？在左边的就是匹配删除左边的，在右边就是匹配删除右边的。

${parameter/pattern/string}

字符串替换，将pattern匹配到的第一个字符串替换成string，pattern可以使用通配符，如：

	[zorro@zorrozou-pc0 bash]$ echo $aaa
	/home/zorro/zorro.txt
	[zorro@zorrozou-pc0 bash]$ echo ${aaa/zorro/jerry}
	/home/jerry/zorro.txt
	[zorro@zorrozou-pc0 bash]$ echo ${aaa/zorr?/jerry}
	/home/jerry/zorro.txt
	[zorro@zorrozou-pc0 bash]$ echo ${aaa/zorr*/jerry}
	/home/jerry
	
${parameter//pattern/string}

意义同上，不过变成了全局替换：

	[zorro@zorrozou-pc0 bash]$ echo ${aaa//zorro/jerry}
	/home/jerry/jerry.txt

${parameter^pattern}
${parameter^^pattern}
${parameter,pattern}
${parameter,,pattern}

大小写转换，如：

	[zorro@zorrozou-pc0 bash]$ echo $aaa
	abcdefg
	[zorro@zorrozou-pc0 bash]$ echo ${aaa^}
	Abcdefg
	[zorro@zorrozou-pc0 bash]$ echo ${aaa^^}
	ABCDEFG
	[zorro@zorrozou-pc0 bash]$ aaa=ABCDEFG
	[zorro@zorrozou-pc0 bash]$ echo ${aaa,}
	aBCDEFG
	[zorro@zorrozou-pc0 bash]$ echo ${aaa,,}
	abcdefg

有了以上符号后，很多变量内容的处理就不必再使用sed这样的重型外部命令处理了，可以一定程度的提高bash脚本的执行效率。

###命令置换

命令置换这个概念就是在命令行中引用一个命令的输出给bash执行，就是我们已经用过的``符号，如：

	[zorro@zorrozou-pc0 bash]$ echo ls
	ls
	[zorro@zorrozou-pc0 bash]$ `echo ls`
	3	  arg1.sh  array.sh	 auth_if.sh  cat.sh   for2.sh  hash.sh	name.sh  ping.sh  redirect.sh  shift.sh  until.sh
	alias.sh  arg.sh   auth_case.sh  case.sh     exit.sh  for.sh   if_1.sh	na.sh	 prime	  select.sh    test	 while.sh

bash会执行放在``号中的命令，并将其输出作为bash的命令再执行一遍。在某些情况下双反引号的表达能力有欠缺，比如嵌套的时候就分不清到底是谁嵌套谁？所以bash还提供另一种写法，跟这个符号一样就是$()。

###算数扩展

$(())

$[]

绝大多数算是表达式可以放在$(())和$[]中进行取值，如：

	[zorro@zorrozou-pc0 bash]$ echo $((123+345))
	468
	[zorro@zorrozou-pc0 bash]$ 
	[zorro@zorrozou-pc0 bash]$ 
	[zorro@zorrozou-pc0 bash]$ echo $((345-123))
	222
	[zorro@zorrozou-pc0 bash]$ echo $((345*123))
	42435
	[zorro@zorrozou-pc0 bash]$ echo $((345/123))
	2
	[zorro@zorrozou-pc0 bash]$ echo $((345%123))
	99
	[zorro@zorrozou-pc0 bash]$ i=1
	[zorro@zorrozou-pc0 bash]$ echo $((i++))
	1
	[zorro@zorrozou-pc0 bash]$ echo $((i++))
	2
	[zorro@zorrozou-pc0 bash]$ echo $i
	3
	[zorro@zorrozou-pc0 bash]$ i=1
	[zorro@zorrozou-pc0 bash]$ echo $((++i))
	2
	[zorro@zorrozou-pc0 bash]$ echo $((++i))
	3
	[zorro@zorrozou-pc0 bash]$ echo $i
	3

可以支持的运算符包括：

       id++ id--
 
       ++id --id
       - +    
       ! ~    
       **     
       * / %  
       + -    
       << >>  
       <= >= < >
              
       == !=  
       &     
       ^  
       |    
       &&    
       ||   
       expr?expr:expr
       = *= /= %= += -= <<= >>= &= ^= |=

另外可以进行算数运算的还有内建命令let：

	[zorro@zorrozou-pc0 bash]$ i=0
	[zorro@zorrozou-pc0 bash]$ let ++i
	[zorro@zorrozou-pc0 bash]$ echo $i
	1
	[zorro@zorrozou-pc0 bash]$ i=2
	[zorro@zorrozou-pc0 bash]$ let i=i**2
	[zorro@zorrozou-pc0 bash]$ echo $i
	4

let的另外一种写法是(()):

	[zorro@zorrozou-pc0 bash]$ i=0
	[zorro@zorrozou-pc0 bash]$ ((i++))
	[zorro@zorrozou-pc0 bash]$ echo $i
	1
	[zorro@zorrozou-pc0 bash]$ ((i+=4))
	[zorro@zorrozou-pc0 bash]$ echo $i
	5
	[zorro@zorrozou-pc0 bash]$ ((i=i**7))
	[zorro@zorrozou-pc0 bash]$ echo $i
	78125

###进程置换

<(list) 和 >(list)

这两个符号可以将list的执行结果当成别的命令需要输入或者输出的文件进行操作，比如我想比较两个命令执行结果的区别：

	[zorro@zorrozou-pc0 bash]$ diff <(df -h) <(df)
	1,10c1,10
	< Filesystem               Size  Used Avail Use% Mounted on
	< dev                      7.8G     0  7.8G   0% /dev
	< run                      7.9G  1.1M  7.8G   1% /run
	< /dev/sda3                 27G   13G   13G  50% /
	< tmpfs                    7.9G  500K  7.8G   1% /dev/shm
	< tmpfs                    7.9G     0  7.9G   0% /sys/fs/cgroup
	< tmpfs                    7.9G  112K  7.8G   1% /tmp
	< /dev/mapper/fedora-home   99G   76G   18G  82% /home
	< tmpfs                    1.6G   16K  1.6G   1% /run/user/120
	< tmpfs                    1.6G   16K  1.6G   1% /run/user/1000
	---
	> Filesystem              1K-blocks     Used Available Use% Mounted on
	> dev                       8176372        0   8176372   0% /dev
	> run                       8178968     1052   8177916   1% /run
	> /dev/sda3                28071076 13202040  13420028  50% /
	> tmpfs                     8178968      500   8178468   1% /dev/shm
	> tmpfs                     8178968        0   8178968   0% /sys/fs/cgroup
	> tmpfs                     8178968      112   8178856   1% /tmp
	> /dev/mapper/fedora-home 103081248 79381728  18440256  82% /home
	> tmpfs                     1635796       16   1635780   1% /run/user/120
	> tmpfs                     1635796       16   1635780   1% /run/user/1000
	
这个符号会将相关命令的输出放到/dev/fd中创建的一个管道文件中，并将管道文件作为参数传递给相关命令进行处理。

###路径匹配扩展

我们已经知道了路径文件名匹配中的*、?、［abc］这样的符号。bash还给我们提供了一些扩展功能的匹配，需要先使用内建命令shopt打开功能开关。支持的功能有：

?(pattern-list)：匹配所给pattern的0次或1次；
*(pattern-list)：匹配所给pattern的0次以上包括0次；
+(pattern-list)：匹配所给pattern的1次以上包括1次； 
@(pattern-list)：匹配所给pattern的1次；
!(pattern-list)：匹配非括号内的所给pattern。

使用：

	[zorro@zorrozou-pc0 bash]$ shopt -u extglob
	[zorro@zorrozou-pc0 bash]$ ls /etc/*(*a)
	/etc/netdata:
	apps_groups.conf  charts.d.conf  netdata.conf

	/etc/pcmcia:
	config.opts
	
关闭功能之后不能使用：

	[zorro@zorrozou-pc0 bash]$ shopt -u extglob
	[zorro@zorrozou-pc0 bash]$ ls /etc/*(*a)
	-bash: syntax error near unexpected token `('


##其他常用符号

关键字或保留字是一类特殊符号或者单词，它们具有相同的实现属性，即：使用type命令查看其类型都显示key word。

	[zorro@zorrozou-pc0 bash]$ type !
	! is a shell keyword

**!**：当只出现一个叹号的时候代表对表达式（命令的返回值）取非。如：

	[zorro@zorrozou-pc0 bash]$ echo hello
	hello
	[zorro@zorrozou-pc0 bash]$ echo $?
	0
	[zorro@zorrozou-pc0 bash]$ ! echo hello
	hello
	[zorro@zorrozou-pc0 bash]$ echo $?
	1

**[[]]**：这个符号基本跟内建命令test一样，当然我们也知道，内建命令test的另一种写法是[  ]。使用：

	[root@zorrozou-pc0 zorro]# [[ -f /etc/passwd ]]
	[root@zorrozou-pc0 zorro]# echo $?
	0
	[root@zorrozou-pc0 zorro]# [[ -f /etc/pass ]]
	[root@zorrozou-pc0 zorro]# echo $?
	1

可以支持的判断参数可以help test查看。

**管道"|"或|&**：管道其实有两种写法，但是我们一般只常用其中单竖线一种。使用的语法格式：

	command1 [ [|⎪|&] command2 ... ]

管道“｜”的主要作用是将command1的标准输出跟command2的标准输入通过管道(pipe)连接起来。“|&”这种写法的含义是将command1标准输出和标准报错都跟command2的和准输入连接起来，这相当于是`command1 2>&1 | command2`的简写方式。

 **&&**：用逻辑与关系连接两个命令，如：command1 && command2，表示当command1执行成功才执行command2，否则command2不会执行。
 
 **||**：用逻辑或关系连接两个命令，如：command1 || command2，表示当command1执行不成功才执行command2，否则command2不会执行。
 
 有了这两个符号，很多if判断都不用写了。
 
 **&**：一般作为一个命令或者lists的后缀，表明这个命令的执放到jobs中跑，bash不必wait进程。
 
 **;**：作为命令或者lists的后缀，主要起到分隔多个命令用的，效果跟回车是一样的。
 
 **(list)**：放在()中执行的命令将在一个subshell环境中执行，这样的命令将打开一个bash子进程执行。即使要执行的是内建命令，也要打开一个subshell的子进程。另外要注意的是，当内建命令前后有管道符号连接的时候，内建命令本身也是要放在subshell中执行的。这个subshell子进程的执行环境基本上是父进程的复制，除了重置了信号的相关设置。bash编程的信号设置使用内建命令trap，将在后续文章中详细说明。

**{ list; }**：大括号作为函数语法结构中的标记字段和list标记字段，是一个关键字。在大括号中要执行的命令列表（list）会放在当前执行环境中执行。命令列表必须以一个换行或者分号作为标记结束。

##转义字符

转义字符很重要，所以需要单独拿出来重点说一下。既然bash给我们提供了这么多的特殊字符，那么这些字符对于bash来说就是需要进行特殊处理的。比如我们想创建一个文件名中包含*的文件：

	[zorro@zorrozou-pc0 bash]$ ls
	3         arg1.sh  array.sh      auth_if.sh  cat.sh   for2.sh  hash.sh  name.sh  ping.sh  read.sh      select.sh  test      while.sh
	alias.sh  arg.sh   auth_case.sh  case.sh     exit.sh  for.sh   if_1.sh  na.sh    prime    redirect.sh  shift.sh   until.sh
	[zorro@zorrozou-pc0 bash]$ touch *sh

这个命令会被bash转义成，对所有文件名以sh结尾的文件做touch操作。那究竟怎么创建这个文件呢？使用转义符：

	[zorro@zorrozou-pc0 bash]$ touch \*sh
	[zorro@zorrozou-pc0 bash]$ ls
	3         arg1.sh  array.sh      auth_if.sh  cat.sh   for2.sh  hash.sh  name.sh  ping.sh  read.sh      select.sh  shift.sh  until.sh
	alias.sh  arg.sh   auth_case.sh  case.sh     exit.sh  for.sh   if_1.sh  na.sh    prime    redirect.sh  '*sh'      test      while.sh

创建了一个叫做*sh的文件，\就是转义符，它可以转义后面的一个字符。如果我想创建一个名字叫\的文件，就应该：

	[zorro@zorrozou-pc0 bash]$ touch \\
	[zorro@zorrozou-pc0 bash]$ ls
	'\'  alias.sh  arg.sh    auth_case.sh  case.sh  exit.sh  for.sh   if_1.sh  na.sh    prime    redirect.sh  '*sh'     test      while.sh
	3    arg1.sh   array.sh  auth_if.sh    cat.sh   for2.sh  hash.sh  name.sh  ping.sh  read.sh  select.sh    shift.sh  until.sh

如何删除*sh呢？rm *sh？注意到了么？一不小心就会误操作！正确的做法是:

	[zorro@zorrozou-pc0 bash]$ rm \*sh

**可以成功避免这种误操作的习惯是，不要用特殊字符作为文件名或者目录名，不要给自己犯错误的机会！**

另外''也是非常重要的转义字符，\只能转义其后面的一个字符，而''可以转义其扩起来的所有字符。另外""也能起到一部分的转义作用，只是它的转义能力没有''强。''和
""的区别是：**''可以转义所有字符，而""不能对$字符、命令置换``和\转义字符进行转义。**


##最后

先补充一个关于正则表达式的说明：

**很多初学者容易将bash的特殊字符和正则表达式搞混，尤其是\*、?、[]这些符号。实际上我们要明白，正则表达式跟bash的通配符和特殊符号没有任何关系。bash本身并不支持正则表达式。那些支持正在表达式的都是外部命令，比如grep、sed、awk这些高级文件处理命令。正则表达式是由这些命令自行处理的，而bash并不对正则表达式做任何解析和解释。**

关于正则表达式的话题，我们就不在bash编程系列文章中讲解了，不过未来可能会在讲解sed、awk这样的高级文本处理命令中说明。

通过本文我们学习了bash的特殊符号相关内容，主要包括的知识点为：

1. 输入输出重定向以及描述符魔术。
2. bash脚本的命令行参数处理。
3. bash脚本的数组和关联数组。
4. bash的各种其他扩展特殊字符操作。
5. 转义字符介绍。
6. 正则表达式和bash特殊字符的区别。

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

