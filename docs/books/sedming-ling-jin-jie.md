# sed命令进阶

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

本文主要介绍sed的高级用法，在阅读本文之前希望读者已经掌握sed的基本使用和正则表达式的相关知识。本文主要可以让读者学会**如何使用sed处理段落内容**。

希望本文能对你帮助。

## 问题举例

日常工作中我们都经常会使用sed命令对文件进行处理。最普遍的是以行为单位处理，比如做替换操作，如：

	[root@TENCENT64 ~]# head -3 /etc/passwd 
	root:x:0:0:root:/root:/bin/bash
	bin:x:1:1:bin:/bin:/sbin/nologin
	daemon:x:2:2:daemon:/sbin:/sbin/nologin
	[root@TENCENT64 ~]# head -3 /etc/passwd |sed 's/bin/xxx/g'
	root:x:0:0:root:/root:/xxx/bash
	xxx:x:1:1:xxx:/xxx:/sxxx/nologin
	daemon:x:2:2:daemon:/sxxx:/sxxx/nologin

于是每一行中只要有"bin"这个关键字的就都被替换成了"xxx"。以"行"为单位的操作，了解sed基本知识之后应该都能处理。我们下面通过一个对段落的操作，来进一步学习一下sed命令的高级用法。

工作场景下有时候遇到的文本内容并不仅仅是以行为单位的输出。举个例子来说，比如ifconfig命令的输出：

	[root@TENCENT64 ~]# ifconfig
	eth1       Link encap:Ethernet  HWaddr 40:F2:E9:09:FC:45  
	          inet addr:10.0.0.1  Bcast:10.213.123.255  Mask:255.255.252.0
	          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
	          RX packets:4699092093 errors:0 dropped:0 overruns:0 frame:0
	          TX packets:4429422167 errors:0 dropped:0 overruns:0 carrier:0
	          collisions:0 txqueuelen:0 
	          RX bytes:621383727756 (578.7 GiB)  TX bytes:987104190070 (919.3 GiB)
	
	eth2    Link encap:Ethernet  HWaddr 40:F2:E9:09:FC:45  
	          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
	          RX packets:421719237 errors:0 dropped:0 overruns:0 frame:0
	          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
	          collisions:0 txqueuelen:0 
	          RX bytes:17982386416 (16.7 GiB)  TX bytes:0 (0.0 b)
	
	eth3    Link encap:Ethernet  HWaddr 40:F2:E9:09:FC:45  
	          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
	          RX packets:401384950 errors:0 dropped:0 overruns:0 frame:0
	          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
	          collisions:0 txqueuelen:0 
	          RX bytes:16934321897 (15.7 GiB)  TX bytes:0 (0.0 b)
	
	eth4    Link encap:Ethernet  HWaddr 40:F2:E9:09:FC:45  
	          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
	          RX packets:139540553 errors:0 dropped:0 overruns:0 frame:0
	          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0
	          collisions:0 txqueuelen:0 
	          RX bytes:5929444543 (5.5 GiB)  TX bytes:0 (0.0 b)
	
	eth5      Link encap:Ethernet  HWaddr 40:F2:E9:09:FC:45  
	          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
	          RX packets:1810276711441 errors:0 dropped:0 overruns:22712568 frame:0
	          TX packets:1951148522633 errors:0 dropped:0 overruns:0 carrier:0
	          collisions:0 txqueuelen:1000 
	          RX bytes:743435149333809 (676.1 TiB)  TX bytes:707431806048867 (643.4 TiB)
	          Memory:a9a40000-a9a60000 
	
	eth6   Link encap:Ethernet  HWaddr 40:F2:E9:09:FC:45  
	          UP BROADCAST RUNNING PROMISC MULTICAST  MTU:1500  Metric:1
	          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
	          TX packets:210438688172 errors:0 dropped:9029561 overruns:0 carrier:0
	          collisions:0 txqueuelen:0 
	          RX bytes:0 (0.0 b)  TX bytes:219869363023063 (199.9 TiB)
	
	eth7   Link encap:Ethernet  HWaddr 40:F2:E9:09:FC:45  
	          UP BROADCAST RUNNING PROMISC MULTICAST  MTU:1500  Metric:1
	          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
	          TX packets:628704252152 errors:0 dropped:20495142 overruns:0 carrier:0
	          collisions:0 txqueuelen:0 
	          RX bytes:0 (0.0 b)  TX bytes:247252814884293 (224.8 TiB)
	
	eth8   Link encap:Ethernet  HWaddr 40:F2:E9:09:FC:45  
	          UP BROADCAST RUNNING PROMISC MULTICAST  MTU:1500  Metric:1
	          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
	          TX packets:7987321426 errors:0 dropped:904533 overruns:0 carrier:0
	          collisions:0 txqueuelen:0 
	          RX bytes:0 (0.0 b)  TX bytes:1467641590110 (1.3 TiB)
	
	eth9   Link encap:Ethernet  HWaddr 40:F2:E9:09:FC:45  
	          UP BROADCAST RUNNING PROMISC MULTICAST  MTU:1500  Metric:1
	          RX packets:0 errors:0 dropped:0 overruns:0 frame:0
	          TX packets:1088671818709 errors:0 dropped:13914796 overruns:0 carrier:0
	          collisions:0 txqueuelen:0 
	          RX bytes:0 (0.0 b)  TX bytes:236639340770145 (215.2 TiB)
	
	lo        Link encap:Local Loopback  
	          inet addr:127.0.0.1  Mask:255.0.0.0
	          UP LOOPBACK RUNNING  MTU:16436  Metric:1
	          RX packets:3094508 errors:0 dropped:0 overruns:0 frame:0
	          TX packets:3094508 errors:0 dropped:0 overruns:0 carrier:0
	          collisions:0 txqueuelen:0 
	          RX bytes:1579253954 (1.4 GiB)  TX bytes:1579253954 (1.4 GiB)
	
	br0 Link encap:Ethernet  HWaddr FE:BD:B8:D5:79:46  
	          UP BROADCAST RUNNING PROMISC MULTICAST  MTU:1500  Metric:1
	          RX packets:118073976200 errors:0 dropped:0 overruns:0 frame:0
	          TX packets:129141892891 errors:0 dropped:0 overruns:0 carrier:0
	          collisions:0 txqueuelen:1000 
	          RX bytes:13271406153198 (12.0 TiB)  TX bytes:21428348510630 (19.4 TiB)
	
	br1 Link encap:Ethernet  HWaddr FE:BD:B8:D5:87:36  
	          UP BROADCAST RUNNING PROMISC MULTICAST  MTU:1500  Metric:1
	          RX packets:210447731529 errors:0 dropped:0 overruns:0 frame:0
	          TX packets:145867293712 errors:0 dropped:0 overruns:0 carrier:0
	          collisions:0 txqueuelen:1000 
	          RX bytes:216934635012821 (197.3 TiB)  TX bytes:112307933521307 (102.1 TiB)
	
	br2 Link encap:Ethernet  HWaddr FE:BD:B8:D5:A1:1C  
	          UP BROADCAST RUNNING PROMISC MULTICAST  MTU:1500  Metric:1
	          RX packets:227580515069 errors:0 dropped:0 overruns:0 frame:0
	          TX packets:224128670696 errors:0 dropped:0 overruns:0 carrier:0
	          collisions:0 txqueuelen:1000 
	          RX bytes:146402818737176 (133.1 TiB)  TX bytes:121031384149060 (110.0 TiB)
	
	br3 Link encap:Ethernet  HWaddr FE:BD:B8:D5:A1:F4  
	          UP BROADCAST RUNNING PROMISC MULTICAST  MTU:1500  Metric:1
	          RX packets:210447731529 errors:0 dropped:0 overruns:0 frame:0
	          TX packets:145867293713 errors:0 dropped:0 overruns:0 carrier:0
	          collisions:0 txqueuelen:1000 
	          RX bytes:216934635012821 (197.3 TiB)  TX bytes:112307933522807 (102.1 TiB)
	
	br4 Link encap:Ethernet  HWaddr FE:BD:B8:D5:A4:9A  
	          UP BROADCAST RUNNING PROMISC MULTICAST  MTU:1500  Metric:1
	          RX packets:210447731531 errors:0 dropped:0 overruns:0 frame:0
	          TX packets:145867293714 errors:0 dropped:0 overruns:0 carrier:0
	          collisions:0 txqueuelen:1000 
	          RX bytes:216934635013645 (197.3 TiB)  TX bytes:112307933522867 (102.1 TiB)
	
	br5 Link encap:Ethernet  HWaddr FE:BD:B8:D5:AA:21  
	          UP BROADCAST RUNNING PROMISC MULTICAST  MTU:1500  Metric:1
	          RX packets:7988225959 errors:0 dropped:0 overruns:0 frame:0
	          TX packets:9460529821 errors:0 dropped:0 overruns:0 carrier:0
	          collisions:0 txqueuelen:1000 
	          RX bytes:1355936046078 (1.2 TiB)  TX bytes:1354671618850 (1.2 TiB)

这是一个有很多网卡的服务器。观察以上输出我们会发现，每个网卡的信息都有多行内容，组成一段。网卡名称和MAC地址在一行，网卡名称IP地址不在一行。类似的还有网卡的收发包数量的信息，以及收发包的字节数。那么对于类似这样的文本内容，当我们想要使用sed将输出处理成：网卡名对应IP地址或者网卡名对应收包字节数，将不在同一行的信息放到同一行再输出该怎么处理呢？类似这样：

	网卡名:收包字节数
	eth1:621383727756
	eth2:17982386416
	...

这样的需求对于一般的sed命令来说显然做不到了。我们需要引入更高级的sed处理功能来处理类似问题。大家可以先将上述代码保存到一个文本文件里以备后续实验，我们先给出答案：

网卡名对应RX字节数：

	[root@zorrozou-pc0 zorro]# sed -n '/^[^ ]/{s/^\([^ ]*\) .*/\1/g;h;: top;n;/^$/b;s/^.*RX bytes:\([0-9]\{1,\}\).*/\1/g;T top;H;x;s/\n/:/g;p}' ifconfig.out 
	eth1:621383727756
	eth2:17982386416
	eth3:16934321897
	eth4:5929444543
	eth5:743435149333809
	eth6:0
	eth7:0
	eth8:0
	eth9:0
	lo:1579253954
	br0:13271406153198
	br1:216934635012821
	br2:146402818737176
	br3:216934635012821
	br4:216934635013645
	br5:1355936046078

网卡名对应ip地址：

	[root@zorrozou-pc0 zorro]# sed -n '/^[^ ]/{s/^\([^ ]*\) .*/\1/g;h;: top;n;/^$/b;s/^.*inet addr:\([0-9]\{1,\}\.[0-9]\{1,\}\.[0-9]\{1,\}\.[0-9]\{1,\}\).*/\1/g;T top;H;x;s/\n/:/g;p}' ifconfig.out 
	eth1:10.0.0.1
	lo:127.0.0.1

我们还会发现显示IP的sed命令很智能的过滤掉了没有IP地址的网卡，只把有IP的网卡显示出来。相信一部分人看到这个命令已经晕了。先不要着急，讲解这个命令的含义之前，我们需要先来了解一下sed的工作原理。

##模式空间和保存空间

默认情况下，sed是将输入内容一行一行进行处理的。如果我们拿一个简单的sed命令举例，如：sed '1,$p' /etc/passwd。处理过程中，sed会一行一行的读入/etc/passwd文件，查看每行是否匹配定址条件（1,$），如果匹配条件，就讲行内容放入模式空间，并打印（p命令）。由于文本流本身的输出，而模式空间内容又被打印一遍，所以这个命令最后会将每一行都显示2遍。

	[zorro@zorrozou-pc0 ~]$ sed '1,$p' /etc/passwd
	root:x:0:0:root:/root:/bin/bash
	root:x:0:0:root:/root:/bin/bash
	bin:x:1:1:bin:/bin:/usr/bin/nologin
	bin:x:1:1:bin:/bin:/usr/bin/nologin
	daemon:x:2:2:daemon:/:/usr/bin/nologin
	daemon:x:2:2:daemon:/:/usr/bin/nologin

默认情况下，sed程序在所有的脚本指令执行完毕后，将自动打印模式空间中的内容，这会导致p命令输出相关行两遍，-n选项可以屏蔽自动打印。

**模式空间（pattern space）**

模式空间的英文是pattern space。在sed的处理过程中使用这个缓存空间缓存了要处理的内容。由上面的例子可以看到，模式空间是sed处理最核心的缓存空间，所有要处理的行内容都会复制进这个空间再进行修改，或根据需要显示。默认情况下sed也并不会修改原文件本身内容，只修改模式空间内容。

**保存空间（hlod space）**

除了模式空间以外，sed还实现了另一个内容缓存空间，名字叫保存空间。大家可以想象这个空间跟模式空间一样，也就是一段内存空间，一般情况下不用，除非我们使用相关指令才会对它进行使用。

##示例命令分析

了解了以上两个空间以后，我们来看看例子中的命令到底进行了什么处理，例子原来是这样的：

	sed -n '/^[^ ]/{s/^\([^ ]*\) .*/\1/g;h;: top;n;/^$/b;s/^.*RX bytes:\([0-9]\{1,\}\).*/\1/g;T top;H;x;s/\n/:/g;p}' ifconfig.out

为了方便分析，我们将这个sed命令写成一个sed脚本，用更清晰的语法结构再来看一下。脚本跟远命令有少许差别，最后的p打印变成了写文件：

	[zorro@zorrozou-pc0 ~]$ cat -n ifconfig.sed 
     1	#!/usr/bin/sed -f
     2	
     3	/^[^ ]/{
     4		s/^\([^ ]*\) .*/\1/g;
     5		h;
     6		: top;
     7		n;
     8		/^$/b;
     9		s/^.*RX bytes:\([0-9]\{1,\}\).*/\1/g;
    10		T top;
    11		H;
    12		x;
    13		s/\n/:/g;
    14	#	p;
    15		w result
    16	}

这个sed脚本执行结果是这样的：

	[zorro@zorrozou-pc0 ~]$ ./ifconfig.sed ifconfig.out 
	eth1
	          inet addr:10.0.0.1  Bcast:10.213.123.255  Mask:255.255.252.0
	          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
	          RX packets:4699092093 errors:0 dropped:0 overruns:0 frame:0
	          TX packets:4429422167 errors:0 dropped:0 overruns:0 carrier:0
	          collisions:0 txqueuelen:0 
	eth1:621383727756
	
	eth2
	          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
	......

最后所有有效输出会写入result文件：

	[zorro@zorrozou-pc0 ~]$ cat result 
	eth1:621383727756
	eth2:17982386416
	eth3:16934321897
	eth4:5929444543
	eth5:743435149333809
	eth6:0
	eth7:0
	eth8:0
	eth9:0
	lo:1579253954
	br0:13271406153198
	br1:216934635012821
	br2:146402818737176
	br3:216934635012821
	br4:216934635013645
	br5:1355936046078

在分析脚本代码之前，我们先要理清楚根据输出内容要做的处理思路。观察整个ifconfig命令输出的内容，我们会发现，每个网卡输出的信息都是由多行组成的，并且每段之间由空行分隔。每个网卡信息段的输出第一行都是网卡名，并且网卡名称没有任何前缀字符：

![sed](/Users/zorro/Desktop/sed.png)

从输出内容分析，我们应该做的事情是，找到以非空格开头的行，取出网卡名记录下来，并且再从下面的非空行找RX bytes:这个关键字，取出它后面的数字（接收字节数）。如果碰见空行，则表示这段分析完成，开始下一段分析。开始分析我们的程序，我们先从头来，如何取出网卡名所在的行？这个很简单，只要行开始不是以空格开头，就是网卡名所在行，所以：

	[zorro@zorrozou-pc0 ~]$ sed -n '/^[^ ]/p' ifconfig.out 
	eth1    Link encap:Ethernet  HWaddr 40:F2:E9:09:FC:45  
	eth2    Link encap:Ethernet  HWaddr 40:F2:E9:09:FC:45  
	eth3    Link encap:Ethernet  HWaddr 40:F2:E9:09:FC:45  
	eth4    Link encap:Ethernet  HWaddr 40:F2:E9:09:FC:45  
	eth5      Link encap:Ethernet  HWaddr 40:F2:E9:09:FC:45  
	......

非空格开头的正则表达式，锚定了段操作的开头。当然，我们找到段操作开头之后，后面绝不仅仅是一个简单的p打印，我们需要更复杂的组合操作。此时{}语法就起到作用了。sed的{}可以将多个命令组合进行操作，每个命令使用分号";"分隔。如：

	[zorro@zorrozou-pc0 ~]$ sed -n '/^[^ ]/{s/^\([^ ]*\) .*/\1/g;p}' ifconfig.out 
	eth1
	eth2
	eth3
	eth4
	eth5

这个命令的意思就是，取出网卡名所在的行，现在模式空间中进行替换操作，只保留网卡名（s/^\([^ ]\*\) .\*/\1/g），然后打印模式空间内容p。这里涉及到一个sed替换命令的正则表达式保存功能，如果不清楚的请自行补充相关知识。

学会了组合命令的{}方法之后，我们就该考虑找到了网卡名所在行之后该做什么了。第一个该做的事情就是，保存网卡名，并且只保留网卡名，别的信息不要。刚才已经通过替换命令实现了。然后下一步应该读取下一行进入模式空间，然后看看下一行中有没有RX bytes:，如果有，就取后面的数组进行保存。如果没有就再看下一行，如此循环，直到看到空行为止。这个过程中，我们需要对找到的有用信息进行保存，如：网卡名，接收数据包。那么保存到哪里呢？如果保存到模式空间，那么下一行读入的时候保存的信息就没了。所以此时我们就需要保存空间来帮我们保存内容了。后面的命令整个组成了一个逻辑，所以我们一起拿出来看：

	[zorro@zorrozou-pc0 ~]$ cat -n ifconfig.sed 
     1	#!/usr/bin/sed -f
     2	
     3	/^[^ ]/{
     4		s/^\([^ ]*\) .*/\1/g;
     5		h;
     6		: top;
     7		n;
     8		/^$/b;
     9		s/^.*RX bytes:\([0-9]\{1,\}\).*/\1/g;
    10		T top;
    11		H;
    12		x;
    13		s/\n/:/g;
    14	#	p;
    15		w result
    16	}

第3行和第3行不用解释了，找到网卡名的行并且在模式空间里只保留网卡名称。之后是第5行的h命令。h命令的意思是，将现在模式空间中的内容，放到保存空间。于是，网卡名就放进了保存空间。

然后是第6行，: top在这里只起到一个标记的作用。我们使用:标记了一个位置名叫top。我们先暂时记住它。

第7行n命令。这个命令就是读取下一行到模式空间。就是说，网卡行已经处理完，并且保存好了，可以n读入下一行了。n之后，下一行的内容就进入模式空间，然后继续从n下面的命令开始处理，就是第8行。

第8行使用的是b命令，用来跳出本次sed处理。这里的含义是检查下一行内容如果是空行/^$/，就跳出本段的sed处理，说明这段网卡信息分析完毕，可以进行下一段分析了。如果不是空行，这行就不起作用，于是继续处理第9行。b命令除了可以跳出本次处理以外，还可以指定跳转的位置，比如上文中使用:标记的top。

第9行使用s替换命令取出行中RX bytes:字符之后的所有数字。这里本身并没有分支判断，分支判断出现在下一行。

第10行T命令是一个逻辑判断指令。它的含义是，如果前面出现的s替换指令没有找到符合条件的行，则跳转到T后面所指定的标记位置。在这里的标记位置为top，是我们在上面使用:标记出来的位置。就是说，如果上面的s替换找不到RX bytes:关键字的行，那么就执行过程会跳回top位置继续执行，就是接着再看下一行进行检查。

在这里，我们实际上是用了冒号标签和T指令构成了一个循环。当条件是s替换找不到指定行的时候，就继续执行本循环。直到找到为止。找到之后就不会再跳回top位置了，而是继续执行第11行。

第11行的指令是H，意思是将当前模式空间中的内容追加进保存空间。当前模式空间已经由s替换指令处理成只保留了接受的字节数。之前的保存空间中已经存了网卡名，追加进字节数之后，保存空间里的内容将由两行构成，第一行是网卡名，第二行是接收字节数。注意h和H指令的区别，h是将当前模式空间中的内容保存进保存空间，这样做会使保存空间中的原有内容丢失。而H是将模式空间内容追加进保存空间，保存空间中的原来内容还在。

此时保存空间中已经存有我们所有想要的内容了，网卡名和接收字节数。它们是放在两行存的，这仍然不是我们想要的结果，我们希望能够在一行中显示，并用冒号分隔。所以下面要做的是替换，将换行替换成冒号。但是我们不能直接操作保存空间中的内容，所以需要将保存空间的内容拿回模式空间才能操作。

第12行是用了x指令，意思是将模式空间内容和保存空间内容互换。互换之后，网卡和接收字节数就回到模式空间了。然后我们可以使用s指令对模式空间内容做替换。

第13行s/\n/:/g，将换行替换成冒号。之后模式空间中的内容就是我们真正想要的“网卡名:接收字节数”了。于是就可以p打印或者使用w指令，保存模式空间内容到某个文件中。

所有指令的退出条件有两个：

1. 第8行，遇到空格之后本段解析结束。
2. 所有指令执行完，打印或保存了相关信息之后执行完。

执行完退出后，sed会接着找下一个网卡信息开始的段，继续下一个网卡的解析操作。这就是这个复杂sed命令的整体处理过程。


明白了整个操作过程之后，我们对sed的模式空间，保存空间和语法相关指令就应该建立了相关概念了。接下来我们还有必要学习一下sed还支持哪些指令，以便以后处理复杂的文本时可以使用。

##常用高级操作命令

d：删除模式空间内容并开始下一个输入处理。

D：删除模式空间中的第一行内容，并开始下一个输入的处理。如果模式空间中只有一行内容，那它的作用跟d指令一样。

h：将模式空间拷贝到保存空间。

H：将模式空间追加到保存空间。

g：将保存空间复制到模式空间。

G：将保存空间追加到模式空间。

n：读入下一行到模式空间。

N：追加下一行到模式空间。

p：打印模式空间中的内容。

s///：替换模式空间中的内容。

x：将模式空间内容和保存空间内容交换。

: lable：标记一个标签，注意lable的字符个数限制为7个字符以内。

t：测试这个指令之前的替换s///命令，如果替换命令能匹配到可替换的内容，则跳转到t指令后面标记的lable上。

T：测试这个指令之前的替换s///命令，如果替换命令不能匹配到可替换的内容，则跳转到T指令后面标记的lable上。

	[zorro@zorrozou-pc0 ~]$ ip ad sh|sed -n '/^[0-9]/{:top;n;s/inet6/inet/;T top;p}'
	    inet ::1/128 scope host 
	    inet fe80::95a9:3e28:5102:1a84/64 scope link 
	[zorro@zorrozou-pc0 ~]$ ip ad sh|sed -n '/^[0-9]/{:top;n;s/inet6/&/;T top;p}'
	    inet6 ::1/128 scope host 
	    inet6 fe80::95a9:3e28:5102:1a84/64 scope link 

定义一个标签top，如果s///的替换功能不能执行，则表示这行中没有inet6这个单词，于是就会到top读取下一行（n命令功能）。如果测试s///成功执行，则p打印相关行。这样就拿出来了有ipv6地址的行。

##最后

关于sed的其它指令，基本都不是难点，这里不再解释。大家可以通过man sed查看帮助。

本文试图通过分析一个sed处理段落内容的案例，介绍了sed的模式空间、保存空间以及跳转、标签（label）这些概念和高级指令。希望大家能理解其使用方法和编程思路，以便在工作中能使用sed更加方便灵活的处理文本信息。工欲善其事，必先利其器。

谢谢大家！


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

